import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useAppStore } from '../../src/store/useAppStore';
import { usePlayers } from '../../src/hooks/usePlayers';
import { COLORS, POSITIONS, CURRENT_YEAR } from '../../src/constants';
import { formatPrice } from '../../src/utils/scoring';

const SC_LOGIN_URL = 'https://www.supercoach.com.au/';

// Injected BEFORE page content loads so we can intercept the page's own API calls.
// The SC website fetches team data using its own auth tokens — we capture that response
// rather than trying to call the API ourselves (which would fail without those tokens).
const INTERCEPT_JS = `
(function() {
  var _sent = false;
  var _teamId = null;
  // Built from players-cf (all players with names), keyed by SC player ID
  var _nameMap = {};

  function log(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', msg: msg }));
  }

  function sendPlayers(players, src) {
    if (_sent || !players || players.length === 0) return;
    _sent = true;
    log('SUCCESS: ' + players.length + ' players from ' + src);
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TEAM_DATA', players: players }));
  }

  function extractPlayers(data, url) {
    if (!data) return;

    // ── Always capture the full player name map from players-cf ────────────────
    // players-cf is an array of ALL players: [{id, first_name, last_name, ...}]
    // It fires BEFORE statsPlayers so we build the map here first.
    if (url.indexOf('players-cf') !== -1 || url.indexOf('/players?') !== -1) {
      var allArr = Array.isArray(data) ? data : [];
      allArr.forEach(function(p) {
        if (p.id && p.first_name) {
          _nameMap[String(p.id)] = { first_name: p.first_name, last_name: p.last_name || '' };
        }
      });
      log('nameMap built: ' + Object.keys(_nameMap).length + ' entries');
    }

    if (_sent) return;

    var obj = Array.isArray(data) ? data[0] : data;
    if (!obj) return;

    log('keys[' + url.split('/').pop().split('?')[0] + ']=' + Object.keys(obj).slice(0,8).join(','));

    // ── statsPlayers: team roster as player_ids — enrich with names from map ──
    if (url.indexOf('statsPlayers') !== -1 && obj.players && obj.players.length > 0) {
      var enriched = obj.players.map(function(tp) {
        var info = _nameMap[String(tp.player_id)] || {};
        return {
          player_id:    tp.player_id,
          first_name:   info.first_name || '',
          last_name:    info.last_name  || '',
          position:     tp.position || '',
          on_bench:     tp.picked === 'false' || tp.picked === false,
          position_sort: tp.position_sort || 0,
        };
      });
      var named = enriched.filter(function(p) { return p.first_name; });
      log('statsPlayers enriched: ' + named.length + '/' + enriched.length);
      if (named.length > 0) {
        // Also extract trades remaining from the response
        var trades = obj.trades;
        var tradesLeft = trades && trades.trades_left != null ? trades.trades_left
          : trades && trades.remaining != null ? trades.remaining : null;
        if (!_sent) {
          _sent = true;
          log('SUCCESS: ' + named.length + ' players, tradesLeft=' + tradesLeft);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'TEAM_DATA', players: named, tradesLeft: tradesLeft,
          }));
        }
        return;
      }
      // If map wasn't ready yet, fall through to other strategies
    }

    // ── Other endpoints that directly embed player objects with names ──────────
    var candidates = [
      obj.players,
      obj.classic_players,
      obj.user_team_players,
      obj.team_players,
      obj.lineup,
      obj.classic_team && obj.classic_team.players,
      obj.data && obj.data.players,
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c && c.length > 0 && (c[0].first_name || c[0].name)) {
        sendPlayers(c, url);
        return;
      }
    }

    // ── /me or /userteams: extract team_id and fetch roster directly ──────────
    var teamId = obj.user_team_id || obj.id;
    if (teamId && !_teamId && (url.indexOf('/me') !== -1 || url.indexOf('/userteam') !== -1)) {
      _teamId = teamId;
      log('got team_id=' + teamId + ', fetching roster...');
      var embedUrl = 'https://www.supercoach.com.au/${CURRENT_YEAR}/api/afl/classic/v1/userteams/' + teamId + '?embed=players,player_stats,positions';
      origFetch(embedUrl, { credentials: 'include', headers: { Accept: 'application/json' } })
        .then(function(r) { return r.json(); })
        .then(function(d) { extractPlayers(d, embedUrl); })
        .catch(function(e) { log('roster fetch err: ' + e.message); });
    }
  }

  // Intercept fetch
  var origFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    var url = (typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url)) || '';
    return origFetch.apply(this, args).then(function(resp) {
      if (url.indexOf('/api/afl/classic') !== -1) {
        resp.clone().json().then(function(data) { extractPlayers(data, url); }).catch(function(){});
      }
      return resp;
    });
  };

  // Intercept XHR
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._scUrl = url || '';
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() {
      var url = xhr._scUrl || '';
      if (url.indexOf('/api/afl/classic') !== -1) {
        log('xhr: ' + url.replace('https://www.supercoach.com.au/${CURRENT_YEAR}/api/afl/classic/v1/',''));
        try { extractPlayers(JSON.parse(xhr.responseText), url); } catch(e) {}
      }
    });
    return origSend.apply(this, arguments);
  };

  log('intercept ready');
  true;
})();
`;

const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export default function MyTeamScreen() {
  const webViewRef = useRef<WebView>(null);
  const {
    scAuthToken, setScAuthToken,
    myTeamIds, setMyTeamIds,
    myBenchIds, setMyBenchIds,
    scTradesLeft, setScTradesLeft,
  } = useAppStore();
  const currentRound = useAppStore(s => s.currentRound);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [syncFailed, setSyncFailed] = useState(false);
  const [pendingScPlayers, setPendingScPlayers] = useState<any[]>([]);

  const { data: allPlayers, isLoading } = usePlayers(CURRENT_YEAR, currentRound);
  const myPlayers = myTeamIds.length > 0 && allPlayers
    ? allPlayers.filter(p => myTeamIds.includes(p.id))
    : null;

  // Match SC players to Footywire players using a tiered strategy:
  // 1. Exact normalised full name
  // 2. Same surname + one first name is a prefix of the other (Zach↔Zachary, Sam↔Samuel)
  // 3. Same surname, only one FW candidate — almost certainly the same player
  // 4. Same surname + same position as tiebreaker
  useEffect(() => {
    if (pendingScPlayers.length === 0 || !allPlayers || allPlayers.length === 0) return;

    // Index FW players by normalised last name for fast lookup
    const fwByLast: Record<string, typeof allPlayers> = {};
    allPlayers.forEach(p => {
      const key = normName(p.last_name);
      if (!fwByLast[key]) fwByLast[key] = [];
      fwByLast[key].push(p);
    });

    const scToFwId = new Map<any, number>();

    for (const sc of pendingScPlayers) {
      const scFirst = normName(sc.first_name ?? sc.player?.first_name ?? '');
      const scLast  = normName(sc.last_name  ?? sc.player?.last_name  ?? sc.name ?? '');
      if (!scLast) continue;

      // Tier 1: exact full name
      const exact = allPlayers.find(p =>
        normName(p.first_name) === scFirst && normName(p.last_name) === scLast
      );
      if (exact) { scToFwId.set(sc, exact.id); continue; }

      const candidates = fwByLast[scLast] ?? [];
      if (candidates.length === 0) continue;

      // Tier 2: first-name prefix (one is a prefix of the other)
      const prefix = candidates.find(p => {
        const fwF = normName(p.first_name);
        return fwF.startsWith(scFirst) || scFirst.startsWith(fwF);
      });
      if (prefix) { scToFwId.set(sc, prefix.id); continue; }

      // Tier 3: sole FW player with this surname
      if (candidates.length === 1) { scToFwId.set(sc, candidates[0].id); continue; }

      // Tier 4: position tiebreaker
      const scPos = sc.position ?? '';
      if (scPos) {
        const posMatch = candidates.find(p =>
          p.positions?.some(pp => pp.position === scPos)
        );
        if (posMatch) { scToFwId.set(sc, posMatch.id); continue; }
      }
    }

    const matchedIds = new Set(scToFwId.values());
    const matched = allPlayers.filter(p => matchedIds.has(p.id));
    console.log('[MyTeam] Matched', matched.length, 'of', pendingScPlayers.length, 'SC players');

    if (matched.length > 0) {
      const benchIds = matched
        .filter(p => {
          const sc = [...scToFwId.entries()].find(([, id]) => id === p.id)?.[0];
          return sc?.on_bench === true;
        })
        .map(p => p.id);

      setMyTeamIds(matched.map(p => p.id));
      setMyBenchIds(benchIds);
      setPendingScPlayers([]);
    }
  }, [pendingScPlayers, allPlayers]);

  function handleWebViewMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'DEBUG') { console.log('[MyTeam WebView]', msg.msg); return; }
      if (msg.type !== 'TEAM_DATA') return;
      const players: any[] = msg.players ?? [];
      console.log('[MyTeam] TEAM_DATA received:', players.length, 'players, tradesLeft:', msg.tradesLeft);
      if (players.length > 0) {
        setPendingScPlayers(players);
        if (msg.tradesLeft != null) setScTradesLeft(Number(msg.tradesLeft));
        setScAuthToken('connected');
        setSyncFailed(false);
        setShowWebView(false);
      }
    } catch (e) {
      console.log('[MyTeam] handleWebViewMessage error:', e);
    }
  }

  function handleLoadEnd() {
    setWebViewLoading(false);
  }

  if (showWebView) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={styles.webViewHeader}>
          <Text style={styles.webViewTitle}>Log in to SuperCoach</Text>
          <TouchableOpacity onPress={() => setShowWebView(false)}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.webViewHint}>
          Log in normally — your team will sync automatically once you're signed in.
        </Text>
        {webViewLoading ? (
          <View style={styles.webViewLoader}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.webViewLoadingText}>Loading SuperCoach...</Text>
          </View>
        ) : null}
        <WebView
          ref={webViewRef}
          source={{ uri: SC_LOGIN_URL }}
          injectedJavaScriptBeforeContentLoaded={INTERCEPT_JS}
          onMessage={handleWebViewMessage}
          onLoadEnd={handleLoadEnd}
          style={{ flex: 1 }}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          javaScriptEnabled={true}
        />
      </View>
    );
  }

  if (!scAuthToken) {
    return (
      <View style={styles.container}>
        <View style={styles.connectCard}>
          <Text style={styles.connectTitle}>Sync Your SuperCoach Team</Text>
          <Text style={styles.connectDesc}>
            Log in with your SuperCoach account to sync your squad, get personalised
            trade recommendations, bye alerts, and captain picks based on your actual team.
          </Text>
          <TouchableOpacity style={styles.connectBtn} onPress={() => setShowWebView(true)}>
            <Text style={styles.connectBtnText}>Connect SuperCoach Account</Text>
          </TouchableOpacity>
          <Text style={styles.connectNote}>
            Your credentials are entered directly on the official SuperCoach website.
            This app never sees your password.
          </Text>
        </View>
      </View>
    );
  }

  // Auth token set but no player IDs yet — sync hasn't completed
  if (!myPlayers) {
    return (
      <View style={styles.container}>
        <View style={styles.connectCard}>
          {isLoading
            ? <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 16 }} />
            : null}
          <Text style={styles.connectTitle} numberOfLines={1}>
            {myTeamIds.length > 0 ? 'Loading player data...' : 'Team not synced yet'}
          </Text>
          {pendingScPlayers.length > 0 ? (
            <Text style={styles.connectNote}>
              {`SC intercepted ${pendingScPlayers.length} players — matching names... Check Expo terminal for details.`}
            </Text>
          ) : null}
          <Text style={styles.connectDesc}>
            Open the SuperCoach website below, log in, and navigate to your team page.
            The sync happens automatically once the page loads your squad.
          </Text>
          <TouchableOpacity
            style={[styles.connectBtn, { marginTop: 8 }]}
            onPress={() => { setSyncFailed(false); setShowWebView(true); }}
          >
            <Text style={styles.connectBtnText}>Open SuperCoach to Sync</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={() => { setScAuthToken(null); setMyTeamIds([]); }}
          >
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const totalValue = myPlayers.reduce((sum, p) => sum + (p.player_stats?.[0]?.price ?? 0), 0);
  const injured = myPlayers.filter(p => p.injury_suspension_status);

  // Separate starters from bench; flex = bench player whose primary pos differs from their listed group
  const starters = myPlayers.filter(p => !myBenchIds.includes(p.id));
  const bench    = myPlayers.filter(p =>  myBenchIds.includes(p.id));

  const byPosition: Record<string, typeof starters> = { DEF: [], MID: [], FWD: [], RUC: [] };
  starters.forEach(p => {
    const pos = p.positions?.[0]?.position ?? 'MID';
    if (byPosition[pos]) byPosition[pos].push(p);
  });

  const renderPlayerRow = (player: (typeof myPlayers)[0], isBench = false) => {
    const stats = player.player_stats?.[0];
    const priceChange = stats?.price_change ?? 0;
    const pos = player.positions?.[0]?.position ?? 'MID';
    const posColor = POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary;
    return (
      <TouchableOpacity
        key={player.id}
        activeOpacity={0.75}
        style={[styles.playerRow, isBench && styles.playerRowBench]}
        onPress={() => router.push(`/player/${player.id}`)}
      >
        <View style={[styles.posDot, { backgroundColor: posColor }]} />
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{player.first_name} {player.last_name}</Text>
          <Text style={styles.playerTeam}>{player.team?.abbrev} · {pos}</Text>
        </View>
        {player.injury_suspension_status ? (
          <View style={styles.injBadge}><Text style={styles.injText}>{player.injury_suspension_status}</Text></View>
        ) : null}
        <View style={styles.playerStats}>
          <Text style={styles.statValue}>{stats?.avg3?.toFixed(0) ?? '-'}</Text>
          <Text style={styles.statLabel}>L3</Text>
        </View>
        <View style={styles.playerStats}>
          <Text style={styles.statValue}>{formatPrice(stats?.price ?? 0)}</Text>
          <Text style={[styles.statLabel, priceChange > 0 ? styles.okText : priceChange < 0 ? styles.dangerText : null]}>
            {priceChange > 0 ? `+${formatPrice(priceChange)}` : priceChange < 0 ? formatPrice(priceChange) : '–'}
          </Text>
        </View>
        <View style={styles.playerStats}>
          <Text style={[styles.statValue, (stats?.ppts ?? 0) > (stats?.avg3 ?? 0) ? styles.dangerText : styles.okText]}>
            {stats?.ppts ?? '-'}
          </Text>
          <Text style={styles.statLabel}>BE</Text>
        </View>
        <Text style={styles.playerChevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Connected banner */}
      <View style={styles.connectedBadge}>
        <View style={styles.connectedDot} />
        <Text style={styles.connectedText}>SuperCoach synced · {myPlayers.length} players</Text>
        <TouchableOpacity onPress={() => { setSyncFailed(false); setShowWebView(true); }} style={styles.resyncBtn}>
          <Text style={styles.resyncText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Team summary */}
      <View style={styles.summaryRow}>
        <SummaryBox label="Team Value" value={formatPrice(totalValue)} />
        <SummaryBox label="Salary Left" value="–" />
        <SummaryBox label="Trades Left" value={scTradesLeft != null ? String(scTradesLeft) : '–'} />
      </View>

      {/* Injury alerts */}
      {injured.length > 0 ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>Injury / Suspension Alerts</Text>
          {injured.map(p => (
            <Text key={p.id} style={styles.alertItem}>
              · {p.first_name} {p.last_name} — {p.injury_suspension_status_text ?? p.injury_suspension_status}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Starting lineup by position */}
      {(['DEF', 'MID', 'FWD', 'RUC'] as const).map(pos => {
        const group = byPosition[pos];
        if (!group?.length) return null;
        const posColor = POSITIONS[pos]?.color ?? COLORS.primary;
        return (
          <View key={pos} style={styles.posGroup}>
            <View style={[styles.posHeader, { borderLeftColor: posColor }]}>
              <Text style={[styles.posHeaderText, { color: posColor }]}>{pos}</Text>
            </View>
            {group.map(player => renderPlayerRow(player))}
          </View>
        );
      })}

      {/* Bench */}
      {bench.length > 0 ? (
        <View style={styles.posGroup}>
          <View style={[styles.posHeader, { borderLeftColor: COLORS.textMuted }]}>
            <Text style={[styles.posHeaderText, { color: COLORS.textMuted }]}>BENCH</Text>
          </View>
          {bench.map((player, i) => {
            const pos = player.positions?.[0]?.position ?? 'MID';
            const starterPositions = starters.map(s => s.positions?.[0]?.position);
            const isFlex = bench.length > 1 && i === bench.length - 1
              && !starterPositions.filter(p => p === pos).length;
            return (
              <View key={player.id}>
                {isFlex ? (
                  <Text style={styles.flexLabel}>FLEX</Text>
                ) : null}
                {renderPlayerRow(player, true)}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Fallback: if no bench data yet, show all players flat */}
      {bench.length === 0 && starters.length === 0 ? (
        <View style={styles.posGroup}>
          {(['DEF', 'MID', 'FWD', 'RUC'] as const).map(pos => {
            const allForPos = myPlayers.filter(p => p.positions?.[0]?.position === pos);
            if (!allForPos.length) return null;
            const posColor = POSITIONS[pos]?.color ?? COLORS.primary;
            return (
              <View key={pos}>
                <View style={[styles.posHeader, { borderLeftColor: posColor }]}>
                  <Text style={[styles.posHeaderText, { color: posColor }]}>{pos}</Text>
                </View>
                {allForPos.map(p => renderPlayerRow(p))}
              </View>
            );
          })}
        </View>
      ) : null}


      <TouchableOpacity
        style={styles.disconnectBtn}
        onPress={() => {
          Alert.alert('Disconnect', 'Remove your SuperCoach connection?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Disconnect', style: 'destructive', onPress: () => {
              setScAuthToken(null);
              setMyTeamIds([]);
            }},
          ]);
        }}
      >
        <Text style={styles.disconnectText}>Disconnect Account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SummaryBox({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={boxStyles.box}>
      <Text style={[boxStyles.value, danger ? boxStyles.danger : null]}>{value}</Text>
      <Text style={boxStyles.label}>{label}</Text>
    </View>
  );
}

const boxStyles = StyleSheet.create({
  box: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, alignItems: 'center', marginRight: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  value: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  danger: { color: COLORS.danger },
  label: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  webViewHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  webViewTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  webViewHint: {
    fontSize: 12, color: COLORS.textSecondary, textAlign: 'center',
    paddingVertical: 8, paddingHorizontal: 16, backgroundColor: COLORS.surfaceAlt,
  },
  cancelBtn: { fontSize: 15, color: COLORS.primary },
  webViewLoader: {
    position: 'absolute', top: 120, left: 0, right: 0,
    alignItems: 'center', zIndex: 10,
  },
  webViewLoadingText: { color: COLORS.textSecondary, marginTop: 8, fontSize: 13 },
  connectCard: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 24, margin: 16, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  connectTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 12, textAlign: 'center' },
  connectDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  connectBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  connectBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 16 },
  connectNote: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16 },
  connectedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.success + '22', borderRadius: 10,
    padding: 12, marginBottom: 16,
  },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginRight: 8 },
  connectedText: { color: COLORS.success, fontWeight: '600', fontSize: 13, flex: 1 },
  resyncBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.success },
  resyncText: { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', marginBottom: 16 },
  alertBox: {
    backgroundColor: COLORS.danger + '11', borderRadius: 10,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.danger + '33',
  },
  alertTitle: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginBottom: 8 },
  alertItem: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 22 },
  posGroup: { marginBottom: 12 },
  posHeader: {
    borderLeftWidth: 3, paddingLeft: 10, marginBottom: 8,
  },
  posHeaderText: { fontSize: 13, fontWeight: '800' },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  playerRowBench: { opacity: 0.75, borderStyle: 'dashed' },
  posDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8, flexShrink: 0 },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  playerTeam: { fontSize: 11, color: COLORS.textMuted },
  flexLabel: {
    fontSize: 10, fontWeight: '800', color: COLORS.accent,
    letterSpacing: 1, marginBottom: 4, marginLeft: 2,
  },
  injBadge: {
    backgroundColor: COLORS.danger + '22', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2, marginRight: 8,
  },
  injText: { fontSize: 10, color: COLORS.danger, fontWeight: '600' },
  playerStats: { alignItems: 'center', marginLeft: 10 },
  statValue: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  statLabel: { fontSize: 9, color: COLORS.textMuted },
  dangerText: { color: COLORS.danger },
  okText: { color: COLORS.success },
  playerChevron: { fontSize: 18, color: COLORS.textMuted, marginLeft: 6 },
  disconnectBtn: {
    marginTop: 24, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.danger + '44', alignItems: 'center',
  },
  disconnectText: { color: COLORS.danger, fontWeight: '600' },
});
