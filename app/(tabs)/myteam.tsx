import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, FlatList,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppStore } from '../../src/store/useAppStore';
import { COLORS, POSITIONS, CURRENT_YEAR } from '../../src/constants';
import { formatPrice } from '../../src/utils/scoring';

const SC_LOGIN_URL = 'https://www.supercoach.com.au/';

// Injected into the WebView after each page load —
// tries to fetch the team API using the session cookie the WebView holds
const INJECTED_JS = `
  (function() {
    async function tryFetchTeam() {
      try {
        const res = await fetch('https://www.supercoach.com.au/${CURRENT_YEAR}/api/afl/classic/v1/teams?embed=players,player_stats,positions', {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TEAM_DATA', data }));
        }
      } catch(e) {}
    }
    // Try immediately and again after 2s to allow session to settle
    tryFetchTeam();
    setTimeout(tryFetchTeam, 2000);
  })();
  true;
`;

interface TeamPlayer {
  id: number;
  first_name: string;
  last_name: string;
  team: { abbrev: string };
  positions: { position: string }[];
  player_stats: { price: number; avg3: number; points: number; injury_suspension_status?: string }[];
}

export default function MyTeamScreen() {
  const { scAuthToken, setScAuthToken } = useAppStore();
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [teamData, setTeamData] = useState<TeamPlayer[] | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);

  function handleWebViewMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'TEAM_DATA' && msg.data) {
        // SuperCoach returns an array of teams, first one is yours
        const myTeam = Array.isArray(msg.data) ? msg.data[0] : msg.data;
        const players = myTeam?.players ?? myTeam?.classic_team?.players ?? [];
        if (players.length > 0) {
          setTeamData(players);
          setScAuthToken('connected');
          setShowWebView(false);
        }
      }
    } catch (e) {}
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
        {webViewLoading && (
          <View style={styles.webViewLoader}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.webViewLoadingText}>Loading SuperCoach...</Text>
          </View>
        )}
        <WebView
          source={{ uri: SC_LOGIN_URL }}
          injectedJavaScriptAfterDocumentCreation={INJECTED_JS}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => setWebViewLoading(false)}
          style={{ flex: 1 }}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
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

  if (!teamData) {
    return (
      <View style={styles.container}>
        <View style={styles.connectCard}>
          <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 16 }} />
          <Text style={styles.connectDesc}>Syncing your team from SuperCoach...</Text>
          <TouchableOpacity
            style={[styles.connectBtn, { marginTop: 20 }]}
            onPress={() => setShowWebView(true)}
          >
            <Text style={styles.connectBtnText}>Retry Sync</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={() => setScAuthToken(null)}
          >
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Calculate team stats
  const totalValue = teamData.reduce((sum, p) => sum + (p.player_stats?.[0]?.price ?? 0), 0);
  const teamAvg = teamData.length > 0
    ? teamData.reduce((sum, p) => sum + (p.player_stats?.[0]?.avg3 ?? 0), 0) / teamData.length
    : 0;
  const injured = teamData.filter(p => p.player_stats?.[0]?.injury_suspension_status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Connected banner */}
      <View style={styles.connectedBadge}>
        <View style={styles.connectedDot} />
        <Text style={styles.connectedText}>SuperCoach team synced</Text>
        <TouchableOpacity onPress={() => setShowWebView(true)} style={styles.resyncBtn}>
          <Text style={styles.resyncText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Team summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryValue}>{teamData.length}</Text>
          <Text style={styles.summaryLabel}>Players</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryValue}>{formatPrice(totalValue)}</Text>
          <Text style={styles.summaryLabel}>Team Value</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryValue}>{teamAvg.toFixed(0)}</Text>
          <Text style={styles.summaryLabel}>L3 Avg</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={[styles.summaryValue, injured.length > 0 && styles.dangerText]}>
            {injured.length}
          </Text>
          <Text style={styles.summaryLabel}>Injured</Text>
        </View>
      </View>

      {/* Injury alerts */}
      {injured.length > 0 && (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>Injury Alerts</Text>
          {injured.map(p => (
            <Text key={p.id} style={styles.alertItem}>
              · {p.first_name} {p.last_name} — {p.player_stats?.[0]?.injury_suspension_status}
            </Text>
          ))}
        </View>
      )}

      {/* Player list */}
      <Text style={styles.sectionTitle}>Your Squad</Text>
      {teamData.map(player => {
        const stats = player.player_stats?.[0];
        const pos = player.positions?.[0]?.position ?? 'MID';
        const posColor = POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary;
        return (
          <View key={player.id} style={styles.playerRow}>
            <View style={[styles.posBadge, { backgroundColor: posColor }]}>
              <Text style={styles.posText}>{pos}</Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.first_name} {player.last_name}</Text>
              <Text style={styles.playerTeam}>{player.team?.abbrev}</Text>
            </View>
            <View style={styles.playerStats}>
              <Text style={styles.statValue}>{stats?.avg3?.toFixed(0) ?? '-'}</Text>
              <Text style={styles.statLabel}>L3</Text>
            </View>
            <View style={styles.playerStats}>
              <Text style={styles.statValue}>{formatPrice(stats?.price ?? 0)}</Text>
              <Text style={styles.statLabel}>Price</Text>
            </View>
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
              setTeamData(null);
            }},
          ]);
        }}
      >
        <Text style={styles.disconnectText}>Disconnect Account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

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
  connectedText: { color: COLORS.success, fontWeight: '600', fontSize: 14, flex: 1 },
  resyncBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.success },
  resyncText: { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', marginBottom: 16 },
  summaryBox: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, alignItems: 'center', marginRight: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  summaryValue: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  summaryLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  dangerText: { color: COLORS.danger },
  alertBox: {
    backgroundColor: COLORS.danger + '11', borderRadius: 10,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.danger + '33',
  },
  alertTitle: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginBottom: 8 },
  alertItem: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  posBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 10 },
  posText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  playerTeam: { fontSize: 11, color: COLORS.textMuted },
  playerStats: { alignItems: 'center', marginLeft: 12 },
  statValue: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  statLabel: { fontSize: 10, color: COLORS.textMuted },
  disconnectBtn: {
    marginTop: 24, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.danger + '44', alignItems: 'center',
  },
  disconnectText: { color: COLORS.danger, fontWeight: '600' },
});
