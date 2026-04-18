import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
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
    if (_sent) return;
    if (!data) return;
    var obj = Array.isArray(data) ? data[0] : data;
    if (!obj) return;

    // Log full keys for debugging
    log('keys[' + url.split('/').pop().split('?')[0] + ']=' + Object.keys(obj).slice(0,8).join(','));

    // Try every known location where players might live
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
      if (candidates[i] && candidates[i].length > 0) {
        sendPlayers(candidates[i], url);
        return;
      }
    }

    // If this is /me or /userteams and has user_team_id, fetch the team directly
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
        log('fetch: ' + url.replace('https://www.supercoach.com.au/${CURRENT_YEAR}/api/afl/classic/v1/',''));
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

export default function MyTeamScreen() {
  const webViewRef = useRef<WebView>(null);
  const { scAuthToken, setScAuthToken, myTeamIds, setMyTeamIds } = useAppStore();
  const currentRound = useAppStore(s => s.currentRound);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [syncFailed, setSyncFailed] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  // Use the main players API, filtered to myTeamIds
  const { data: allPlayers, isLoading } = usePlayers(CURRENT_YEAR, currentRound);
  const myPlayers = myTeamIds.length > 0 && allPlayers
    ? allPlayers.filter(p => myTeamIds.includes(p.id))
    : null;

  function handleWebViewMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'DEBUG') {
        const line = `[${new Date().toLocaleTimeString()}] ${msg.msg}`;
        console.log('[MyTeam WebView]', msg.msg);  // visible in Expo terminal
        setDebugLog(prev => [line, ...prev].slice(0, 30));
        return;
      }

      if (msg.type !== 'TEAM_DATA') return;
      const players: any[] = msg.players ?? [];
      console.log('[MyTeam] TEAM_DATA received, player count:', players.length);
      console.log('[MyTeam] First player sample:', JSON.stringify(players[0]));
      setDebugLog(prev => [`✅ Got ${players.length} players!`, ...prev]);
      if (players.length > 0) {
        // statsPlayers uses player_id, other endpoints use id
        const ids: number[] = players
          .map((p: any) => Number(p.player_id ?? p.id))
          .filter(n => n > 0);
        console.log('[MyTeam] Setting myTeamIds:', ids.slice(0, 5), '... total:', ids.length);
        setMyTeamIds(ids);
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
        {/* Debug overlay — shows intercepted network calls */}
        <View style={styles.debugPanel}>
          <Text style={styles.debugTitle}>Debug log (last 8 events)</Text>
          {debugLog.slice(0, 8).map((line, i) => (
            <Text key={i} style={styles.debugLine} numberOfLines={1}>{line}</Text>
          ))}
        </View>
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

  // Team stats from main API data
  const totalValue = myPlayers.reduce((sum, p) => sum + (p.player_stats?.[0]?.price ?? 0), 0);
  const teamAvg = myPlayers.length > 0
    ? myPlayers.reduce((sum, p) => sum + (p.player_stats?.[0]?.avg3 ?? 0), 0) / myPlayers.length
    : 0;
  const injured = myPlayers.filter(p => p.injury_suspension_status);

  // Group by position
  const byPosition: Record<string, typeof myPlayers> = { DEF: [], MID: [], FWD: [], RUC: [], '?': [] };
  myPlayers.forEach(p => {
    const pos = p.positions?.[0]?.position ?? '?';
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(p);
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Connected banner */}
      <View style={styles.connectedBadge}>
        <View style={styles.connectedDot} />
        <Text style={styles.connectedText}>SuperCoach team synced · {myPlayers.length} players</Text>
        <TouchableOpacity onPress={() => { setSyncFailed(false); setShowWebView(true); }} style={styles.resyncBtn}>
          <Text style={styles.resyncText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Team summary */}
      <View style={styles.summaryRow}>
        <SummaryBox label="Team Value" value={formatPrice(totalValue)} />
        <SummaryBox label="L3 Avg" value={teamAvg.toFixed(0)} />
        <SummaryBox label="Injured" value={String(injured.length)} danger={injured.length > 0} />
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

      {/* Squad by position */}
      {(['DEF', 'MID', 'FWD', 'RUC'] as const).map(pos => {
        const group = byPosition[pos];
        if (!group?.length) return null;
        const posColor = POSITIONS[pos]?.color ?? COLORS.primary;
        return (
          <View key={pos} style={styles.posGroup}>
            <View style={[styles.posHeader, { borderLeftColor: posColor }]}>
              <Text style={[styles.posHeaderText, { color: posColor }]}>{pos}</Text>
            </View>
            {group.map(player => {
              const stats = player.player_stats?.[0];
              return (
                <View key={player.id} style={styles.playerRow}>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.first_name} {player.last_name}</Text>
                    <Text style={styles.playerTeam}>{player.team?.abbrev}</Text>
                  </View>
                  {player.injury_suspension_status ? (
                    <View style={styles.injBadge}>
                      <Text style={styles.injText}>{player.injury_suspension_status}</Text>
                    </View>
                  ) : null}
                  <View style={styles.playerStats}>
                    <Text style={styles.statValue}>{stats?.avg3?.toFixed(0) ?? '-'}</Text>
                    <Text style={styles.statLabel}>L3</Text>
                  </View>
                  <View style={styles.playerStats}>
                    <Text style={styles.statValue}>{formatPrice(stats?.price ?? 0)}</Text>
                    <Text style={styles.statLabel}>Price</Text>
                  </View>
                  <View style={styles.playerStats}>
                    <Text style={[styles.statValue, (stats?.ppts ?? 0) > (stats?.avg3 ?? 0) ? styles.dangerText : styles.okText]}>
                      {stats?.ppts ?? '-'}
                    </Text>
                    <Text style={styles.statLabel}>BE</Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

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
  playerInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  playerTeam: { fontSize: 11, color: COLORS.textMuted },
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
  disconnectBtn: {
    marginTop: 24, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.danger + '44', alignItems: 'center',
  },
  disconnectText: { color: COLORS.danger, fontWeight: '600' },
  debugPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)', padding: 8, maxHeight: 160,
  },
  debugTitle: { color: '#00ff88', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  debugLine: { color: '#aaffcc', fontSize: 9, fontFamily: 'monospace', lineHeight: 13 },
});
