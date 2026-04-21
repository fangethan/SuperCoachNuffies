import React, { Fragment } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePlayers, useByeRounds, useFootywireBreakevens } from '../../src/hooks/usePlayers';
import { useAppStore } from '../../src/store/useAppStore';
import { getScoreBreakdown, formatPrice, formatPriceChange, getPriceDirection } from '../../src/utils/scoring';
import { COLORS, POSITIONS, CURRENT_YEAR } from '../../src/constants';
import { footywireApi } from '../../src/api/footywire';

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentRound = useAppStore(s => s.currentRound);
  const { data: players, isLoading } = usePlayers(CURRENT_YEAR, currentRound);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);
  const { data: fwMap } = useFootywireBreakevens();

  const player = players?.find(p => String(p.id) === id);
  const stats = player?.player_stats?.[0];

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
  const priceDir = getPriceDirection(stats.price_change ?? 0);
  const breakdown = getScoreBreakdown(stats);
  const byeRound = byeMap?.[player.team?.name ?? ''];

  const playerKey = footywireApi.normaliseName(`${player.first_name} ${player.last_name}`);
  const fwPlayer = fwMap?.[playerKey];

  // Prefer footywire injury/suspension status, fall back to SC API
  const fwInjury = fwPlayer?.injuryStatus ?? null;
  const scInjStatus = player.injury_suspension_status;
  const scInjText = player.injury_suspension_status_text ?? scInjStatus ?? '';
  const isSusp = fwInjury === 'SUS' || /susp/i.test(scInjText + (scInjStatus ?? ''));
  const isInj = fwInjury === 'INJ' || (!fwInjury && !!scInjStatus && !isSusp);
  const showInjBanner = isSusp || isInj;
  const injBannerText = scInjText || (isSusp ? 'Suspended' : 'Injured');

  // Prefer footywire breakeven, fall back to SC API ppts
  const ppts = fwPlayer?.breakeven ?? stats.ppts ?? 0;
  const likelihood = fwPlayer?.likelihood ?? null;
  const avg3 = stats.avg3 ?? 0;
  const beStatus = ppts === 0 ? 'unknown' : ppts > avg3 * 1.15 ? 'danger' : ppts > avg3 ? 'warning' : 'safe';

  const oppavg = stats.oppavg ?? 0;
  const venavg = stats.venavg ?? 0;
  const avg = stats.avg ?? 0;
  const avg5 = stats.avg5 ?? 0;

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
            <Text style={styles.injBannerText}>
              {injBannerText}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Key stats row */}
      <View style={styles.statsGrid}>
        <StatBox label="This Round" value={String(stats.points ?? '-')} large />
        <StatBox label="Season Avg" value={avg.toFixed(1)} large />
        <StatBox label="L3 Avg" value={avg3.toFixed(1)} large highlight />
        <StatBox label="L5 Avg" value={avg5.toFixed(1)} large />
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
            {formatPriceChange(stats.price_change ?? 0)}
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
        <View style={styles.matchupRow}>
          <View style={styles.matchupItem}>
            <Text style={styles.matchupLabel}>vs</Text>
            <Text style={styles.matchupValue}>{stats.opp?.name ?? '-'}</Text>
          </View>
          <View style={styles.matchupItem}>
            <Text style={styles.matchupLabel}>Opp Avg</Text>
            <Text style={[
              styles.matchupValue,
              oppavg > 75 ? styles.up : oppavg < 60 ? styles.down : styles.neutral,
            ]}>
              {oppavg > 0 ? oppavg.toFixed(0) : '-'}
            </Text>
          </View>
          <View style={styles.matchupItem}>
            <Text style={styles.matchupLabel}>Venue</Text>
            <Text style={styles.matchupValue}>{stats.ven?.short_name ?? '-'}</Text>
          </View>
          <View style={styles.matchupItem}>
            <Text style={styles.matchupLabel}>Venue Avg</Text>
            <Text style={styles.matchupValue}>
              {venavg > 0 ? venavg.toFixed(0) : '-'}
            </Text>
          </View>
        </View>
      </View>

      {/* Bye info */}
      {byeRound ? (
        <View style={styles.byeBox}>
          <Text style={styles.byeText}>Bye: Round {byeRound}</Text>
        </View>
      ) : null}

      {/* Score breakdown */}
      {stats.games > 0 && breakdown.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Score Breakdown — Round {currentRound}</Text>
          {breakdown.map(item => (
            <View key={item.stat} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel} numberOfLines={1}>{item.label}</Text>
              <Text style={styles.breakdownCount}>{item.count}×</Text>
              <View style={styles.breakdownBarTrack}>
                <View
                  style={[
                    styles.breakdownBar,
                    {
                      width: `${Math.min(100, Math.abs(item.points) / Math.abs(breakdown[0].points) * 100)}%` as any,
                      backgroundColor: item.points >= 0 ? COLORS.primary : COLORS.danger,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.breakdownPts, item.points >= 0 ? styles.up : styles.down]}>
                {item.points > 0 ? '+' : ''}{item.points.toFixed(0)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Previous season */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Previous Season</Text>
        <View style={styles.prevSeason}>
          <StatBox label="Games" value={String(player.previous_games ?? 0)} />
          <StatBox label="Average" value={(player.previous_average ?? 0).toFixed(1)} highlight />
          <StatBox label="Total" value={String(player.previous_total ?? 0)} />
        </View>
      </View>
    </ScrollView>
  );
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
    letterSpacing: 1, marginBottom: 3,
  },
  injBannerText: { color: COLORS.danger, fontWeight: '500', fontSize: 13, textAlign: 'center' },
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
  matchupRow: { flexDirection: 'row' },
  matchupItem: { flex: 1, alignItems: 'center' },
  matchupLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 3 },
  matchupValue: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  byeBox: {
    backgroundColor: COLORS.warning + '22', borderRadius: 10,
    padding: 12, marginBottom: 12, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.warning + '44',
  },
  byeText: { color: COLORS.warning, fontWeight: '700', fontSize: 14 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  breakdownLabel: { width: 140, fontSize: 12, color: COLORS.textSecondary },
  breakdownCount: { width: 28, fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginRight: 8 },
  breakdownBarTrack: { flex: 1, height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden', marginRight: 8 },
  breakdownBar: { height: '100%', borderRadius: 3 },
  breakdownPts: { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'right' },
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
