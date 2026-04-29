import React, { Fragment, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePlayers, useByeRounds, useFootywireBreakevens, useMatchList, useMatchupStats } from '../../src/hooks/usePlayers';
import { useRoundScores } from '../../src/hooks/useRoundScores';
import { useAppStore } from '../../src/store/useAppStore';
import { formatPrice, formatPriceChange, getPriceDirection } from '../../src/utils/scoring';
import { COLORS, POSITIONS, CURRENT_YEAR } from '../../src/constants';
import { footywireApi, MatchEntry } from '../../src/api/footywire';

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentRound = useAppStore(s => s.currentRound);
  const { data: players, isLoading } = usePlayers(CURRENT_YEAR, currentRound);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);
  const { data: fwMap } = useFootywireBreakevens();
  const { data: roundScoresById } = useRoundScores(CURRENT_YEAR, currentRound, players ?? []);
  const { data: matchList } = useMatchList(CURRENT_YEAR);
  const [activeTab, setActiveTab] = useState<'history' | 'fixtures'>('history');

  const player = players?.find(p => String(p.id) === id);
  const stats = player?.player_stats?.[0];
  const playerId = player ? player.id : 0;
  const roundScores = roundScoresById[playerId];
  const lastRoundScore = (roundScores?.lastScore ?? 0) > 0 ? String(roundScores!.lastScore) : 'N/A';

  // Compute nextMatch before early returns so hooks are called unconditionally
  const nextMatch = matchList
    ?.filter(m => (m.homeTeam === player?.team?.name || m.awayTeam === player?.team?.name) && m.homeScore === null)
    .sort((a, b) => a.round - b.round)[0];
  const { data: matchupStats } = useMatchupStats(player, nextMatch);

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!player || !stats) {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorText}>Player not found</Text>
      </View>
    );
  }

  const allPositions = player.positions?.map(p => p.position) ?? ['MID'];
  const pos = allPositions[0];
  const posColor = POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary;
  const isDPP = allPositions.length > 1;
  const totalPriceChange = stats.total_price_change ?? stats.price_change ?? 0;
  const priceDir = getPriceDirection(totalPriceChange);
  const allByeRounds = byeMap?.[player.team?.name ?? ''] ?? [];
  const futureByeRounds = allByeRounds.filter(r => r > currentRound);

  const fwPlayer = fwMap ? footywireApi.lookupPlayer(fwMap, player.first_name, player.last_name) : undefined;

  const fwInjury = fwPlayer?.injuryStatus ?? null;
  const isSusp = fwInjury === 'SUS';
  const isInj = fwInjury === 'INJ';
  const showInjBanner = isSusp || isInj;
  const injuryDetail = fwPlayer?.injuryDetail ?? null;
  const injuryReturning = fwPlayer?.returning ?? null;

  // Prefer footywire breakeven, fall back to SC API ppts
  const ppts = fwPlayer?.breakeven ?? stats.ppts ?? 0;
  const likelihood = fwPlayer?.likelihood ?? null;
  const avg3 = stats.avg3 ?? 0;
  const beStatus = ppts === 0 ? 'unknown' : ppts > avg3 * 1.15 ? 'danger' : ppts > avg3 ? 'warning' : 'safe';

  const avg = stats.avg ?? 0;
  const avg5 = roundScores?.avg5 ?? 0;

  const perRoundScores = roundScores?.roundScores ?? {};
  const teamMatches = matchList?.filter(
    m => m.homeTeam === player.team.name || m.awayTeam === player.team.name
  ) ?? [];
  const history = [...teamMatches]
    .filter(m => m.homeScore !== null)
    .sort((a, b) => b.round - a.round);
  const fixtures = [...teamMatches]
    .filter(m => m.homeScore === null)
    .sort((a, b) => a.round - b.round);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        {isDPP ? (
          <View style={styles.dppRow}>
            {allPositions.map((p, i) => {
              const col = POSITIONS[p as keyof typeof POSITIONS]?.color ?? COLORS.primary;
              return (
                <React.Fragment key={p}>
                  {i > 0 && <Text style={styles.dppSlash}>/</Text>}
                  <View style={[styles.posBadge, { backgroundColor: col }]}>
                    <Text style={styles.posText}>{p}</Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        ) : (
          <View style={[styles.posBadge, { backgroundColor: posColor }]}>
            <Text style={styles.posText}>{pos}</Text>
          </View>
        )}
        <Text style={styles.name}>{player.first_name} {player.last_name}</Text>
        <Text style={styles.team}>{player.team?.name ?? ''}</Text>
        {showInjBanner ? (
          <View style={styles.injBanner}>
            <Text style={styles.injBannerLabel}>
              {isSusp ? 'SUSPENDED' : '✚  INJURED'}
            </Text>
            {injuryDetail && !isSusp ? (
              <Text style={styles.injBannerText}>{injuryDetail}</Text>
            ) : null}
            {injuryReturning ? (
              <View style={styles.injReturnRow}>
                <Text style={styles.injReturnLabel}>Returns: </Text>
                <Text style={styles.injReturnValue}>{injuryReturning}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Key stats row */}
      <View style={styles.statsGrid}>
        <StatBox label="Last Round" value={lastRoundScore} large />
        <StatBox label="Season Avg" value={avg.toFixed(1)} large />
        <StatBox label="L3 Avg" value={avg3 > 0 ? avg3.toFixed(1) : 'N/A'} large />
        <StatBox label="L5 Avg" value={avg5 > 0 ? avg5.toFixed(1) : 'N/A'} large />
      </View>

      {/* Price row */}
      <View style={styles.priceRow}>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Price</Text>
          <Text style={styles.priceValue}>{formatPrice(stats.price ?? 0)}</Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Change</Text>
          <Text style={[
            styles.priceValue,
            priceDir === 'up' ? styles.up : priceDir === 'down' ? styles.down : styles.neutral,
          ]}>
            {totalPriceChange !== 0 ? formatPriceChange(totalPriceChange) : '-'}
          </Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Owned</Text>
          <Text style={styles.priceValue}>{(stats.owned ?? 0).toFixed(1)}%</Text>
        </View>
      </View>

      {/* Breakeven section */}
      {ppts > 0 ? (
        <View style={[
          styles.beSection,
          beStatus === 'danger' ? styles.beDanger :
          beStatus === 'warning' ? styles.beWarning : styles.beSafe,
        ]}>
          <View style={styles.beRow}>
            <View>
              <Text style={styles.beLabel}>Breakeven</Text>
              <Text style={[
                styles.beValue,
                beStatus === 'danger' ? styles.down :
                beStatus === 'warning' ? styles.warn : styles.up,
              ]}>
                {ppts}
              </Text>
            </View>
            <View style={styles.beRight}>
              <Text style={styles.beContext}>
                {beStatus === 'danger'
                  ? `Needs ${ppts} pts to stop price drop — ${ppts - avg3 > 0 ? `${(ppts - avg3).toFixed(0)} above` : 'at'} L3 avg`
                  : beStatus === 'warning'
                  ? `Slightly above L3 avg (${avg3.toFixed(0)}) — price may dip`
                  : `Below L3 avg (${avg3.toFixed(0)}) — price rising`}
                {likelihood !== null ? `\nLikelihood of hitting BE: ${likelihood}%` : ''}
              </Text>
              <View style={[
                styles.bePill,
                beStatus === 'danger' ? styles.bePillDanger :
                beStatus === 'warning' ? styles.bePillWarning : styles.bePillSafe,
              ]}>
                <Text style={styles.bePillText}>
                  {beStatus === 'danger' ? 'TRADE OUT' : beStatus === 'warning' ? 'MONITOR' : 'HOLD / BUY'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* Matchup */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Week's Matchup</Text>
        {nextMatch ? (
          <View style={styles.matchupRow}>
            <View style={styles.matchupItem}>
              <Text style={styles.matchupLabel}>vs</Text>
              <Text style={styles.matchupValue}>
                {nextMatch.homeTeam === player.team.name ? nextMatch.awayAbbrev : nextMatch.homeAbbrev}
              </Text>
            </View>
            <View style={styles.matchupItem}>
              <Text style={styles.matchupLabel}>Opp Avg</Text>
              <Text style={[
                styles.matchupValue,
                (matchupStats?.oppAvg ?? 0) > 75 ? styles.up
                  : (matchupStats?.oppAvg ?? 0) > 0 && (matchupStats?.oppAvg ?? 0) < 60 ? styles.down
                  : styles.neutral,
              ]}>
                {(matchupStats?.oppAvg ?? 0) > 0 ? matchupStats!.oppAvg.toFixed(1) : '-'}
              </Text>
            </View>
            <View style={styles.matchupItem}>
              <Text style={styles.matchupLabel}>Venue</Text>
              <Text style={styles.matchupValue}>{shortenVenue(nextMatch.venue) || '-'}</Text>
            </View>
            <View style={styles.matchupItem}>
              <Text style={styles.matchupLabel}>Venue Avg</Text>
              <Text style={styles.matchupValue}>
                {(matchupStats?.venueAvg ?? 0) > 0 ? matchupStats!.venueAvg.toFixed(1) : '-'}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.matchupValue}>No upcoming games</Text>
        )}
      </View>

      {/* Bye info */}
      {futureByeRounds.length > 0 ? (
        <View style={styles.byeBox}>
          <Text style={styles.byeText}>
            {futureByeRounds.length === 1
              ? `Bye: Round ${futureByeRounds[0]}`
              : `Byes: ${futureByeRounds.map(r => `Round ${r}`).join(' & ')}`}
          </Text>
        </View>
      ) : null}

      {/* History / Fixtures */}
      <View style={styles.section}>
        {/* Tab toggle */}
        <View style={hfStyles.tabRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[hfStyles.tabBtn, activeTab === 'history' && hfStyles.tabBtnActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[hfStyles.tabLabel, activeTab === 'history' && hfStyles.tabLabelActive]}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[hfStyles.tabBtn, activeTab === 'fixtures' && hfStyles.tabBtnActive]}
            onPress={() => setActiveTab('fixtures')}
          >
            <Text style={[hfStyles.tabLabel, activeTab === 'fixtures' && hfStyles.tabLabelActive]}>Fixtures</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'history' && (
          <>
            <View style={hfStyles.headerRow}>
              <Text style={[hfStyles.headerCell, { width: 38 }]}>Rnd</Text>
              <Text style={[hfStyles.headerCell, { width: 82 }]}>Opponent</Text>
              <Text style={[hfStyles.headerCell, { flex: 1 }]}>Venue</Text>
              <Text style={[hfStyles.headerCell, { width: 80 }]}>Result</Text>
              <Text style={[hfStyles.headerCell, { width: 32 }]}>SC</Text>
            </View>
            {history.length === 0 ? (
              <Text style={hfStyles.empty}>No completed games yet</Text>
            ) : history.map(m => {
              const isHome = m.homeTeam === player.team.name;
              const oppAbbrev = isHome ? m.awayAbbrev : m.homeAbbrev;
              const myScore  = isHome ? m.homeScore! : m.awayScore!;
              const oppScore = isHome ? m.awayScore! : m.homeScore!;
              const result   = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
              const sc       = perRoundScores[m.round] ?? 0;
              return (
                <View key={m.round} style={hfStyles.row}>
                  <Text style={[hfStyles.cell, { width: 38, textAlign: 'center' }]}>{m.round}</Text>
                  <Text style={[hfStyles.cell, { width: 82, textAlign: 'center' }]}>{oppAbbrev} ({isHome ? 'H' : 'A'})</Text>
                  <Text style={[hfStyles.cell, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{m.venue}</Text>
                  <View style={{ width: 80, alignItems: 'center' }}>
                    <View style={[hfStyles.pill,
                      result === 'W' ? hfStyles.pillWin : result === 'L' ? hfStyles.pillLoss : hfStyles.pillDraw,
                    ]}>
                      <Text style={hfStyles.pillText}>{myScore}-{oppScore}</Text>
                    </View>
                  </View>
                  <Text style={[hfStyles.cell, { width: 32, textAlign: 'center' }]}>
                    {sc > 0 ? sc : '-'}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        {activeTab === 'fixtures' && (
          <>
            <View style={hfStyles.headerRow}>
              <Text style={[hfStyles.headerCell, { width: 38 }]}>Rnd</Text>
              <Text style={[hfStyles.headerCell, { width: 82 }]}>Opponent</Text>
              <Text style={[hfStyles.headerCell, { flex: 1 }]}>Venue</Text>
            </View>
            {fixtures.length === 0 ? (
              <Text style={hfStyles.empty}>No remaining fixtures</Text>
            ) : fixtures.map(m => {
              const isHome   = m.homeTeam === player.team.name;
              const oppAbbrev = isHome ? m.awayAbbrev : m.homeAbbrev;
              return (
                <View key={m.round} style={hfStyles.row}>
                  <Text style={[hfStyles.cell, { width: 38, textAlign: 'center' }]}>{m.round}</Text>
                  <Text style={[hfStyles.cell, { width: 82, textAlign: 'center' }]}>{oppAbbrev} ({isHome ? 'H' : 'A'})</Text>
                  <Text style={[hfStyles.cell, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{m.venue}</Text>
                </View>
              );
            })}
          </>
        )}
      </View>

      {/* Previous season — only show when data is available */}
      {(player.previous_games ?? 0) > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Previous Season</Text>
          <View style={styles.prevSeason}>
            <StatBox label="Games" value={String(player.previous_games)} />
            <StatBox label="Average" value={(player.previous_average ?? 0).toFixed(1)} highlight />
            <StatBox label="Total" value={String(player.previous_total)} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function shortenVenue(v: string): string {
  return v.replace(/ Stadium$/, '').replace(/ Arena$/, '').replace(/ Oval$/, '').replace(/ Park$/, '');
}

function StatBox({ label, value, large, highlight }: {
  label: string; value: string; large?: boolean; highlight?: boolean;
}) {
  return (
    <View style={[boxStyles.box, highlight ? boxStyles.highlight : null]}>
      <Text style={[
        boxStyles.value,
        large ? boxStyles.valueLarge : null,
        highlight ? boxStyles.valueHighlight : null,
      ]}>
        {value}
      </Text>
      <Text style={boxStyles.label}>{label}</Text>
    </View>
  );
}

const boxStyles = StyleSheet.create({
  box: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
    marginRight: 8,
  },
  highlight: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '11' },
  value: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  valueLarge: { fontSize: 22 },
  valueHighlight: { color: COLORS.primary },
  label: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  errorText: { color: COLORS.danger },
  header: { alignItems: 'center', marginBottom: 20 },
  posBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  posText: { fontWeight: '800', fontSize: 13, color: '#fff' },
  dppRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dppSlash: { fontSize: 16, fontWeight: '300', color: COLORS.textMuted, marginHorizontal: 4, marginBottom: 8 },
  name: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  team: { fontSize: 15, color: COLORS.textSecondary, marginTop: 2 },
  injBanner: {
    backgroundColor: COLORS.danger + '22', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 10,
    borderWidth: 1, borderColor: COLORS.danger + '44',
    alignItems: 'center', minWidth: 200,
  },
  injBannerLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.danger,
    letterSpacing: 1, marginBottom: 4,
  },
  injBannerText: { color: COLORS.danger, fontWeight: '600', fontSize: 14, textAlign: 'center', marginBottom: 6 },
  injReturnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  injReturnLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  injReturnValue: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700' },
  warn: { color: COLORS.warning },
  statsGrid: { flexDirection: 'row', marginBottom: 12 },
  priceRow: {
    flexDirection: 'row', marginBottom: 16,
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  priceBox: { flex: 1, alignItems: 'center' },
  priceLabel: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2 },
  priceValue: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  up: { color: COLORS.success },
  down: { color: COLORS.danger },
  neutral: { color: COLORS.textSecondary },
  section: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 12 },
  matchupRow: { flexDirection: 'row', alignItems: 'flex-start' },
  matchupItem: { flex: 1, alignItems: 'center' },
  matchupLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 3 },
  matchupValue: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  byeBox: {
    backgroundColor: COLORS.warning + '22', borderRadius: 10,
    padding: 12, marginBottom: 12, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.warning + '44',
  },
  byeText: { color: COLORS.warning, fontWeight: '700', fontSize: 14 },
  prevSeason: { flexDirection: 'row' },

  // Breakeven section
  beSection: {
    borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1,
  },
  beSafe: { backgroundColor: COLORS.success + '11', borderColor: COLORS.success + '33' },
  beWarning: { backgroundColor: COLORS.warning + '11', borderColor: COLORS.warning + '33' },
  beDanger: { backgroundColor: COLORS.danger + '11', borderColor: COLORS.danger + '33' },
  beRow: { flexDirection: 'row', alignItems: 'center' },
  beLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 2 },
  beValue: { fontSize: 28, fontWeight: '800' },
  beRight: { flex: 1, marginLeft: 16 },
  beContext: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 8 },
  bePill: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  bePillSafe: { backgroundColor: COLORS.success + '22' },
  bePillWarning: { backgroundColor: COLORS.warning + '22' },
  bePillDanger: { backgroundColor: COLORS.danger + '22' },
  bePillText: { fontSize: 11, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: 0.5 },
});

const hfStyles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6,
  },
  tabBtnActive: { backgroundColor: COLORS.surface },
  tabLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  tabLabelActive: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  headerRow: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 2,
  },
  headerCell: {
    fontSize: 10, fontWeight: '700', textAlign: 'center',
    color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '55',
  },
  cell: { fontSize: 13, color: COLORS.textPrimary },
  pill: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    alignItems: 'center', justifyContent: 'center', minWidth: 64,
  },
  pillWin:  { backgroundColor: COLORS.success + '33', borderWidth: 1, borderColor: COLORS.success },
  pillLoss: { backgroundColor: COLORS.danger  + '33', borderWidth: 1, borderColor: COLORS.danger  },
  pillDraw: { backgroundColor: '#1e3a5f',              borderWidth: 1, borderColor: '#4a7fa5'      },
  pillText: { fontSize: 11, fontWeight: '800', color: COLORS.textPrimary },
  empty: { fontSize: 13, color: COLORS.textMuted, paddingTop: 12, textAlign: 'center' },
});
