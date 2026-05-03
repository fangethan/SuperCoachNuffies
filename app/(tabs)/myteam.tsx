import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { useAppStore } from '../../src/store/useAppStore';
import { usePlayers } from '../../src/hooks/usePlayers';
import { useRoundScores } from '../../src/hooks/useRoundScores';
import { COLORS, POSITIONS, CURRENT_YEAR } from '../../src/constants';
import { formatPrice } from '../../src/utils/scoring';
import { PitchView } from '../../src/components/PitchView';
import { TeamBadge } from '../../src/components/TeamBadge';
import { parseTeamScreenshot, ParsedPlayer } from '../../src/utils/teamScreenshotParser';
import { pushTeam } from '../../src/api/teamSync';

const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

// Returns the Levenshtein edit distance between two normalised surnames, capped at
// `cap`. Used to absorb single-character OCR errors like "Worrel" → "Worrell".
function levDistance(a: string, b: string, cap = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const al = a.length;
  const bl = b.length;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

export default function MyTeamScreen() {
  const {
    scAuthToken, setScAuthToken,
    myTeamIds, setMyTeamIds,
    myBenchIds, setMyBenchIds,
    captainId, setCaptainId,
    vcId, setVcId,
    myTeamScPositions, setMyTeamScPositions,
    myTeamEmgIds, setMyTeamEmgIds,
  } = useAppStore();
  const currentRound = useAppStore(s => s.currentRound);
  const [view, setView] = useState<'pitch' | 'list'>('pitch');
  const [pickedImages, setPickedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingPlayers, setPendingPlayers] = useState<ParsedPlayer[]>([]);

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

  // Match parsed OCR players to Footywire players. Strategy:
  //  1. Filter candidates by surname AND team abbreviation — strongest signal.
  //  2. If still ambiguous, narrow by first-initial prefix on first_name.
  //  3. Last resort: ignore team and rely on surname + initial only.
  useEffect(() => {
    if (pendingPlayers.length === 0 || !allPlayers || allPlayers.length === 0) return;

    const fwByLast: Record<string, typeof allPlayers> = {};
    allPlayers.forEach(p => {
      const key = normName(p.last_name);
      if (!fwByLast[key]) fwByLast[key] = [];
      fwByLast[key].push(p);
    });

    const scToFwId = new Map<ParsedPlayer, number>();

    for (const sc of pendingPlayers) {
      const scLast = normName(sc.lastName);
      const scInit = sc.firstInitial.toLowerCase();
      const candidates = fwByLast[scLast] ?? [];

      // Tier 1: exact surname + team (strongest signal when team is known)
      if (sc.team && candidates.length > 0) {
        const byTeam = candidates.filter(p => p.team?.abbrev === sc.team);
        if (byTeam.length === 1) { scToFwId.set(sc, byTeam[0].id); continue; }
        const byTeamInit = byTeam.find(p => normName(p.first_name).startsWith(scInit));
        if (byTeamInit) { scToFwId.set(sc, byTeamInit.id); continue; }
      }

      // Tier 2: surname + initial (no team filter). Handles both "team OCR was
      // wrong" and "team OCR was missing entirely" — the latter is the only path
      // for highlighted captain/VC cards and bench cards where contrast loses
      // the team text.
      if (candidates.length > 0) {
        const byInit = candidates.find(p => normName(p.first_name).startsWith(scInit));
        if (byInit) { scToFwId.set(sc, byInit.id); continue; }
        // Tier 3: sole candidate by surname (no other Anderson/Daicos/etc.).
        if (candidates.length === 1) { scToFwId.set(sc, candidates[0].id); continue; }
      }

      // Tier 4: fuzzy surname (Levenshtein ≤ 1) — catches single-char OCR misreads
      // like "Worrel" → "Worrell". Prefer the same-team candidate if available, fall
      // back to initial-only when the team is missing or wrong.
      const fuzzy =
        (sc.team && allPlayers.find(p =>
          p.team?.abbrev === sc.team &&
          normName(p.first_name).startsWith(scInit) &&
          levDistance(normName(p.last_name), scLast, 1) <= 1,
        )) ||
        allPlayers.find(p =>
          normName(p.first_name).startsWith(scInit) &&
          levDistance(normName(p.last_name), scLast, 1) <= 1,
        );
      if (fuzzy) {
        console.log('[MyTeam] fuzzy match', sc.firstInitial + '.' + sc.lastName, '→', fuzzy.first_name, fuzzy.last_name);
        scToFwId.set(sc, fuzzy.id);
        continue;
      }
    }

    const matchedIds = new Set(scToFwId.values());
    const matched = allPlayers.filter(p => matchedIds.has(p.id));
    console.log('[MyTeam] Matched', matched.length, 'of', pendingPlayers.length, 'parsed players');

    if (matched.length > 0) {
      const scPositionMap: Record<number, string> = {};
      const benchIds: number[] = [];

      matched.forEach(p => {
        const sc = [...scToFwId.entries()].find(([, id]) => id === p.id)?.[0];
        if (!sc) return;
        scPositionMap[p.id] = sc.position;
        if (sc.isBench) benchIds.push(p.id);
      });

      const teamIds = matched.map(p => p.id);
      setMyTeamIds(teamIds);
      setMyBenchIds(benchIds);
      setMyTeamScPositions(scPositionMap);
      setMyTeamEmgIds([]);
      setScAuthToken('imported');
      setPendingPlayers([]);

      // Push the imported team to Supabase so it follows the user across devices.
      // Failure is non-fatal — the team is already saved locally; we just log so
      // the next sync attempt has a chance.
      pushTeam({
        myTeamIds: teamIds,
        myBenchIds: benchIds,
        myTeamScPositions: scPositionMap,
        myTeamEmgIds: [],
        captainId: captainId,
        vcId: vcId,
      }).catch(err => console.warn('[MyTeam] pushTeam failed:', err));
    }
  }, [pendingPlayers, allPlayers]);

  async function pickImages() {
    setImportError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setImportError('Photo library access is required to import a screenshot.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return null;
    const uris = result.assets.map(a => a.uri);
    setPickedImages(uris);
    return uris;
  }

  // Re-import (used from the synced banner): pick and process in one shot, skipping
  // the preview step that the empty-state has.
  async function reimportTeam() {
    const uris = await pickImages();
    if (uris) await processImages(uris);
  }

  async function processImages(uris: string[] = pickedImages) {
    if (uris.length === 0) return;
    setIsProcessing(true);
    setImportError(null);
    try {
      const all: ParsedPlayer[] = [];
      for (const uri of uris) {
        const ocr = await TextRecognition.recognize(uri);
        all.push(...parseTeamScreenshot(ocr));
      }
      // Dedup by first-initial + last-name (case-insensitive). Team is dropped from
      // the key because team-abbrev OCR is the most error-prone field; surname +
      // initial is unique enough across the AFL roster. First occurrence wins.
      const seen = new Set<string>();
      const merged: ParsedPlayer[] = [];
      for (const p of all) {
        const key = `${p.firstInitial}|${p.lastName}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(p);
      }
      console.log(
        '[MyTeam] OCR', pickedImages.length, 'image(s) →',
        all.length, 'entries → deduped to', merged.length, 'unique players'
      );
      if (merged.length === 0) {
        setImportError('Couldn\'t find any players in the screenshot(s). Try a clearer image of your full SuperCoach team page.');
        return;
      }
      setPendingPlayers(merged);
      setPickedImages([]);
    } catch (e: any) {
      console.log('[MyTeam] OCR error:', e);
      setImportError(`Failed to read screenshot: ${e.message ?? 'unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }

  // Empty state — nothing imported yet
  if (!scAuthToken || !myPlayers) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.connectCard}>
            <Text style={styles.connectTitle}>Import Your SuperCoach Team</Text>
            <Text style={styles.connectDesc}>
              Take one or more screenshots of your full SuperCoach team page and
              import them here. Players that show up in multiple screenshots are
              automatically deduplicated.
            </Text>

            {pickedImages.length > 0 ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.previewStrip}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {pickedImages.map((uri, idx) => (
                    <Image key={`${uri}-${idx}`} source={{ uri }} style={styles.previewThumb} resizeMode="cover" />
                  ))}
                </ScrollView>
                <Text style={styles.connectNote}>
                  {pickedImages.length} image{pickedImages.length === 1 ? '' : 's'} selected
                </Text>
                <TouchableOpacity
                  style={[styles.connectBtn, isProcessing && styles.connectBtnDisabled]}
                  disabled={isProcessing}
                  onPress={() => processImages()}
                >
                  {isProcessing
                    ? <ActivityIndicator color={COLORS.background} />
                    : <Text style={styles.connectBtnText}>Process Screenshots</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  disabled={isProcessing}
                  onPress={() => setPickedImages([])}
                >
                  <Text style={styles.secondaryBtnText}>Choose Different Images</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.connectBtn} onPress={pickImages}>
                <Text style={styles.connectBtnText}>Pick Screenshot(s)</Text>
              </TouchableOpacity>
            )}

            {importError ? <Text style={styles.errorText}>{importError}</Text> : null}
            {isLoading && pickedImages.length === 0 ? (
              <Text style={styles.connectNote}>Loading player database…</Text>
            ) : null}
            {pendingPlayers.length > 0 ? (
              <Text style={styles.connectNote}>
                Matching {pendingPlayers.length} parsed players to the database…
              </Text>
            ) : null}
            <Text style={styles.connectNote}>
              No login required — your screenshots stay on this device. Recognition runs locally via ML Kit.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  const totalValue = myPlayers.reduce((sum, p) => sum + (p.player_stats?.[0]?.price ?? 0), 0);
  const totalValueFormatted = '$' + Math.round(totalValue).toLocaleString('en-AU');
  const injured = myPlayers.filter(p => p.injury_suspension_status);

  const flatRoundScores: Record<number, number> = {};
  myPlayers.forEach(p => {
    const rs = roundScoresById[p.id];
    if (rs?.lastScore) flatRoundScores[p.id] = rs.lastScore;
  });

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
      <View style={styles.syncBanner}>
        <View style={styles.syncBannerLeft}>
          <View style={styles.connectedDot} />
          <Text style={styles.syncBannerText}>Team imported · {myPlayers.length} players</Text>
        </View>
        <TouchableOpacity
          onPress={reimportTeam}
          style={styles.resyncBtn}
          disabled={isProcessing}
        >
          <Text style={styles.resyncText}>{isProcessing ? 'Processing…' : 'Re-import'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <SummaryBox label="Team Value" value={totalValueFormatted} />
        <SummaryBox label="Salary Left" value="–" />
        <SummaryBox label="Trades Left" value="–" />
      </View>

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

          {bench.length > 0 ? (
            <View style={styles.posGroup}>
              <View style={[styles.posHeader, { borderLeftColor: COLORS.textMuted }]}>
                <Text style={[styles.posHeaderText, { color: COLORS.textMuted }]}>BENCH</Text>
              </View>
              {bench.map(player => renderPlayerRow(player, true))}
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={() => {
              Alert.alert('Clear team', 'Remove this imported team?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => {
                  setScAuthToken(null);
                  setMyTeamIds([]);
                }},
              ]);
            }}
          >
            <Text style={styles.disconnectText}>Clear Imported Team</Text>
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
  connectCard: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 24, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  connectTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 12, textAlign: 'center' },
  connectDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  connectBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', marginBottom: 8,
  },
  secondaryBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  connectNote: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16, marginTop: 6 },
  errorText: { fontSize: 13, color: COLORS.danger, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  previewStrip: {
    width: '100%', marginBottom: 8,
  },
  previewThumb: {
    width: 120, aspectRatio: 0.6,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
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
