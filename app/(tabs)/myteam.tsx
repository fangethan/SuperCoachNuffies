import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useAppStore } from '../../src/store/useAppStore';
import { usePlayers } from '../../src/hooks/usePlayers';
import { useRoundScores } from '../../src/hooks/useRoundScores';
import { COLORS, POSITIONS, CURRENT_YEAR } from '../../src/constants';
import { formatPrice } from '../../src/utils/scoring';
import { PitchView } from '../../src/components/PitchView';
import { TeamBadge } from '../../src/components/TeamBadge';

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
      // SC position integers: 1=DEF 2=MID 3=RUC 4=FWD 5=FLEX
      var scPosMap = { '1': 'DEF', '2': 'MID', '3': 'RUC', '4': 'FWD', '5': 'FLEX' };
      var enriched = obj.players.map(function(tp) {
        var info = _nameMap[String(tp.player_id)] || {};
        var rawPos = String(tp.position || '');
        var sc_position = scPosMap[rawPos] || rawPos;
        return {
          player_id:    tp.player_id,
          first_name:   info.first_name || '',
          last_name:    info.last_name  || '',
          sc_position:  sc_position,
          position:     sc_position,
          on_bench:     tp.picked === 'false' || tp.picked === false,
          position_sort: tp.position_sort || 0,
          emergency:    !!(tp.emergency === true || tp.emergency === 'true' || tp.emg || tp.is_emergency || false),
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
    captainId, setCaptainId,
    vcId, setVcId,
    myTeamScPositions, setMyTeamScPositions,
    myTeamEmgIds, setMyTeamEmgIds,
  } = useAppStore();
  const currentRound = useAppStore(s => s.currentRound);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [syncFailed, setSyncFailed] = useState(false);
  const [pendingScPlayers, setPendingScPlayers] = useState<any[]>([]);
  const [view, setView] = useState<'pitch' | 'list'>('pitch');

  const { data: allPlayers, isLoading } = usePlayers(CURRENT_YEAR, currentRound);
  const { data: roundScoresById } = useRoundScores(CURRENT_YEAR, currentRound, allPlayers ?? []);
  const myPlayers = myTeamIds.length > 0 && allPlayers
    ? allPlayers.filter(p => myTeamIds.includes(p.id))
    : null;

  const navigation = useNavigation();
  useEffect(() => {
    if (!myPlayers) { navigation.setOptions({ headerRight: undefined }); return; }
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerToggle}>
          {(['pitch', 'list'] as const).map(v => (
            <TouchableOpacity
              key={v}
              onPress={() => setView(v)}
              style={[styles.headerToggleBtn, view === v && styles.headerToggleBtnActive]}
            >
              <Text style={[styles.headerToggleText, view === v && styles.headerToggleTextActive]}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ),
    });
  }, [navigation, view, myPlayers]);

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
      const scPositionMap: Record<number, string> = {};
      const emgIds: number[] = [];
      const benchIds: number[] = [];

      matched.forEach(p => {
        const entry = [...scToFwId.entries()].find(([, id]) => id === p.id);
        const sc = entry?.[0];
        if (sc?.sc_position) scPositionMap[p.id] = sc.sc_position;
        if (sc?.on_bench === true) benchIds.push(p.id);
        if (sc?.emergency === true) emgIds.push(p.id);
      });

      setMyTeamIds(matched.map(p => p.id));
      setMyBenchIds(benchIds);
      setMyTeamScPositions(scPositionMap);
      setMyTeamEmgIds(emgIds);
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
  const totalValueFormatted = '$' + Math.round(totalValue).toLocaleString('en-AU');
  const injured = myPlayers.filter(p => p.injury_suspension_status);

  // Flat map: player id → last round score
  const flatRoundScores: Record<number, number> = {};
  myPlayers.forEach(p => {
    const rs = roundScoresById[p.id];
    if (rs?.lastScore) flatRoundScores[p.id] = rs.lastScore;
  });

  // Separate starters from bench; flex = bench player whose primary pos differs from their listed group
  const starters = myPlayers.filter(p => !myBenchIds.includes(p.id));
  const bench    = myPlayers.filter(p =>  myBenchIds.includes(p.id));

  const byPosition: Record<string, typeof starters> = { DEF: [], MID: [], RUC: [], FWD: [], FLEX: [] };
  starters.forEach(p => {
    const pos = myTeamScPositions[p.id] ?? p.positions?.[0]?.position ?? 'MID';
    if (byPosition[pos]) byPosition[pos].push(p);
    else byPosition.MID.push(p);
  });

  const renderPlayerRow = (player: (typeof myPlayers)[0], isBench = false) => {
    const stats = player.player_stats?.[0];
    const priceChange = stats?.price_change ?? 0;
    const pos = myTeamScPositions[player.id] ?? player.positions?.[0]?.position ?? 'MID';
    const posColor = pos === 'FLEX' ? '#30D158' : (POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary);
    const isCap = player.id === captainId;
    const isVCap = player.id === vcId;
    return (
      <TouchableOpacity
        key={player.id}
        activeOpacity={0.75}
        style={[styles.playerRow, isBench && styles.playerRowBench]}
        onPress={() => router.push(`/player/${player.id}`)}
      >
        <View style={styles.badgeWrap}>
          <TeamBadge teamName={player.team?.name ?? ''} size={38} />
          {isCap && (
            <View style={[styles.capBadge, { backgroundColor: '#FFD200' }]}>
              <Text style={[styles.capText, { color: '#000' }]}>C</Text>
            </View>
          )}
          {isVCap && !isCap && (
            <View style={[styles.capBadge, { backgroundColor: '#C084FC' }]}>
              <Text style={styles.capText}>V</Text>
            </View>
          )}
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName} numberOfLines={1}>{player.first_name} {player.last_name}</Text>
          <View style={styles.playerMeta}>
            <Text style={styles.playerTeam}>{player.team?.abbrev}</Text>
            <View style={[styles.posPill, { backgroundColor: posColor + '22', borderColor: posColor + '55' }]}>
              <Text style={[styles.posLabel, { color: posColor }]}>{pos}</Text>
            </View>
            {player.injury_suspension_status ? (
              <View style={styles.injBadge}><Text style={styles.injText}>{player.injury_suspension_status}</Text></View>
            ) : null}
          </View>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{stats?.avg3?.toFixed(0) ?? '–'}</Text>
          <Text style={styles.statLabel}>L3</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{formatPrice(stats?.price ?? 0)}</Text>
          <Text style={[styles.statLabel, priceChange > 0 ? styles.okText : priceChange < 0 ? styles.dangerText : null]}>
            {priceChange > 0 ? `+${formatPrice(priceChange)}` : priceChange < 0 ? formatPrice(priceChange) : '–'}
          </Text>
        </View>
        <View style={styles.statCol}>
          <Text style={[styles.statValue, (stats?.ppts ?? 0) > (stats?.avg3 ?? 0) ? styles.dangerText : styles.okText]}>
            {stats?.ppts ?? '–'}
          </Text>
          <Text style={styles.statLabel}>BE</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Sync status banner */}
      <View style={styles.syncBanner}>
        <View style={styles.syncBannerLeft}>
          <View style={styles.connectedDot} />
          <Text style={styles.syncBannerText}>SuperCoach synced · {myPlayers.length} players</Text>
        </View>
        <TouchableOpacity
          onPress={() => { setSyncFailed(false); setShowWebView(true); }}
          style={styles.resyncBtn}
        >
          <Text style={styles.resyncText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Summary boxes */}
      <View style={styles.summaryRow}>
        <SummaryBox label="Team Value" value={totalValueFormatted} />
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

      {/* Main content */}
      {view === 'pitch' ? (
        <PitchView
          players={myPlayers}
          benchIds={myBenchIds}
          captainId={captainId}
          vcId={vcId}
          roundScores={flatRoundScores}
          scPositions={myTeamScPositions}
          emgIds={myTeamEmgIds}
          onPlayerPress={p => router.push(`/player/${p.id}`)}
          onSetCaptain={setCaptainId}
          onSetVC={setVcId}
        />
      ) : (
        <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
          {/* Starting lineup by position */}
          {(['DEF', 'MID', 'RUC', 'FWD', 'FLEX'] as const).map(pos => {
            const group = byPosition[pos];
            if (!group?.length) return null;
            const posColor = pos === 'FLEX' ? '#30D158' : (POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary);
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
                    {isFlex ? <Text style={styles.flexLabel}>FLEX</Text> : null}
                    {renderPlayerRow(player, true)}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Fallback: no bench data yet */}
          {bench.length === 0 && starters.length === 0 ? (
            <View style={styles.posGroup}>
              {(['DEF', 'MID', 'RUC', 'FWD', 'FLEX'] as const).map(pos => {
                const allForPos = myPlayers.filter(p =>
                  (myTeamScPositions[p.id] ?? p.positions?.[0]?.position ?? 'MID') === pos
                );
                if (!allForPos.length) return null;
                const posColor = pos === 'FLEX' ? '#30D158' : (POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary);
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
      )}
    </View>
  );
}

function SummaryBox({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={boxStyles.box}>
      <Text
        style={[boxStyles.value, danger ? boxStyles.danger : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
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
  listContainer: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
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
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.success + '18',
    paddingHorizontal: 16, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: COLORS.success + '33',
  },
  syncBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  connectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  syncBannerText: { color: COLORS.success, fontWeight: '600', fontSize: 13 },
  resyncBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: COLORS.success + '66' },
  resyncText: { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, marginBottom: 6 },
  // Nav header toggle (rendered via navigation.setOptions)
  headerToggle: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8, padding: 2, marginRight: 12,
  },
  headerToggleBtn: {
    borderRadius: 6, paddingHorizontal: 14, paddingVertical: 5,
  },
  headerToggleBtnActive: { backgroundColor: COLORS.primary },
  headerToggleText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  headerToggleTextActive: { color: '#000' },
  alertBox: {
    backgroundColor: COLORS.danger + '11', borderRadius: 10,
    padding: 14, marginBottom: 8, marginHorizontal: 16,
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
    paddingHorizontal: 10, paddingVertical: 9, marginBottom: 7,
    borderWidth: 1, borderColor: COLORS.border,
    gap: 8,
  },
  playerRowBench: { opacity: 0.75, borderStyle: 'dashed' },
  badgeWrap: { position: 'relative', flexShrink: 0 },
  capBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.background,
  },
  capText: { fontSize: 8, fontWeight: '800', color: '#fff' },
  playerInfo: { flex: 1, minWidth: 0 },
  playerName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  playerMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  playerTeam: { fontSize: 11, color: COLORS.textMuted },
  posPill: {
    borderRadius: 4, borderWidth: 1,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  posLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  flexLabel: {
    fontSize: 10, fontWeight: '800', color: COLORS.accent,
    letterSpacing: 1, marginBottom: 4, marginLeft: 2,
  },
  injBadge: {
    backgroundColor: COLORS.danger + '22', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  injText: { fontSize: 10, color: COLORS.danger, fontWeight: '600' },
  statCol: { alignItems: 'center', minWidth: 44 },
  statValue: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  statLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 1 },
  dangerText: { color: COLORS.danger },
  okText: { color: COLORS.success },
  disconnectBtn: {
    marginTop: 24, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.danger + '44', alignItems: 'center',
  },
  disconnectText: { color: COLORS.danger, fontWeight: '600' },
});
