import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppStore } from '../../src/store/useAppStore';
import { COLORS } from '../../src/constants';

const SC_LOGIN_URL = 'https://www.supercoach.com.au/login';

export default function MyTeamScreen() {
  const { scAuthToken, setScAuthToken } = useAppStore();
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);

  function handleWebViewMessage(event: any) {
    // Capture auth token injected from the page
    const data = event.nativeEvent.data;
    if (data?.startsWith('SC_TOKEN:')) {
      const token = data.replace('SC_TOKEN:', '');
      setScAuthToken(token);
      setShowWebView(false);
    }
  }

  // Inject JS to extract the auth token from localStorage after login
  const injectedJS = `
    (function() {
      const token = localStorage.getItem('sc_token')
        || localStorage.getItem('authToken')
        || localStorage.getItem('token');
      if (token) {
        window.ReactNativeWebView.postMessage('SC_TOKEN:' + token);
      }
      // Watch for login completion
      const observer = new MutationObserver(() => {
        const t = localStorage.getItem('sc_token')
          || localStorage.getItem('authToken')
          || localStorage.getItem('token');
        if (t) {
          window.ReactNativeWebView.postMessage('SC_TOKEN:' + t);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    })();
    true;
  `;

  if (showWebView) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={styles.webViewHeader}>
          <Text style={styles.webViewTitle}>Log in to SuperCoach</Text>
          <TouchableOpacity onPress={() => setShowWebView(false)}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
        </View>
        {webViewLoading && (
          <View style={styles.webViewLoader}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        )}
        <WebView
          source={{ uri: SC_LOGIN_URL }}
          injectedJavaScript={injectedJS}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => setWebViewLoading(false)}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  if (!scAuthToken) {
    return (
      <View style={styles.container}>
        <View style={styles.connectCard}>
          <Text style={styles.connectTitle}>Connect Your SuperCoach Team</Text>
          <Text style={styles.connectDesc}>
            Log in with your SuperCoach account to sync your team, get personalised
            trade recommendations, bye alerts, and captain picks based on your actual squad.
          </Text>
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={() => setShowWebView(true)}
          >
            <Text style={styles.connectBtnText}>Connect SuperCoach Account</Text>
          </TouchableOpacity>
          <Text style={styles.connectNote}>
            Your credentials are entered directly on the official SuperCoach website.
            This app never sees your password.
          </Text>
        </View>

        {/* Manual team builder fallback */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => Alert.alert('Coming Soon', 'Manual team builder coming in next update.')}
        >
          <Text style={styles.manualBtnText}>Build Team Manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.connectedBadge}>
        <View style={styles.connectedDot} />
        <Text style={styles.connectedText}>SuperCoach account connected</Text>
      </View>

      <Text style={styles.sectionTitle}>Team Overview</Text>
      <Text style={styles.placeholder}>
        Team data loading... (team endpoints to be mapped from SuperCoach API)
      </Text>

      <TouchableOpacity
        style={styles.disconnectBtn}
        onPress={() => {
          Alert.alert('Disconnect', 'Remove your SuperCoach connection?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Disconnect', style: 'destructive', onPress: () => setScAuthToken(null) },
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
    padding: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  webViewTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  cancelBtn: { fontSize: 15, color: COLORS.primary },
  webViewLoader: {
    position: 'absolute', top: 80, left: 0, right: 0,
    alignItems: 'center', zIndex: 10,
  },
  connectCard: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 24, margin: 16, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  connectTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 12, textAlign: 'center' },
  connectDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  connectBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center',
    marginBottom: 12,
  },
  connectBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 16 },
  connectNote: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.textMuted, marginHorizontal: 12, fontSize: 13 },
  manualBtn: {
    marginHorizontal: 16, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  manualBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  connectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.success + '22', borderRadius: 10,
    padding: 12, marginBottom: 24,
  },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  connectedText: { color: COLORS.success, fontWeight: '600', fontSize: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  placeholder: { color: COLORS.textMuted, fontSize: 14 },
  disconnectBtn: {
    marginTop: 32, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.danger + '44', alignItems: 'center',
  },
  disconnectText: { color: COLORS.danger, fontWeight: '600' },
});
