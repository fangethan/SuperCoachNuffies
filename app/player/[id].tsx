import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePlayers, useByeRounds } from '../../src/hooks/usePlayers';
import { useAppStore } from '../../src/store/useAppStore';
import { getScoreBreakdown, formatPrice, formatPriceChange, getPriceDirection } from '../../src/utils/scoring';
import { COLORS, POSITIONS, CURRENT_YEAR } from '../../src/constants';

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentRound = useAppStore(s => s.currentRound);
  const { data: players, isLoading } = usePlayers(CURRENT_YEAR, currentRound);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);

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

  const pos = player.positions?.[0]?.position ?? 'MID';
  const posColor = POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary;
  const priceDir = getPriceDirection(stats.price_change ?? 0);
  const breakdown = getScoreBreakdown(stats);
  const byeRound = byeMap?.[player.team?.name ?? ''];

  const oppavg = stats.oppavg ?? 0;
  const venavg = stats.venavg ?? 0;
  const avg = stats.avg ?? 0;
  const avg3 = stats.avg3 ?? 0;
  const avg5 = stats.avg5 ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.posBadge, { backgroundColor: posColor }]}>
          <Text style={styles.posText}>{pos}</Text>
        </View>
        <Text style={styles.name}>{player.first_name} {player.last_name}</Text>
        <Text style={styles.team}>{player.team?.name ?? ''}</Text>
        {player.injury_suspension_status ? (
          <View style={styles.injBanner}>
            <Text style={styles.injText}>
              {player.injury_suspension_status_text ?? player.injury_suspension_status}
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
          <Text style={styles.priceLabel}>Breakeven</Text>
          <Text style={[styles.priceValue, (stats.ppts ?? 0) > avg3 ? styles.down : styles.up]}>
            {stats.ppts ?? '-'}
          </Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Owned</Text>
          <Text style={styles.priceValue}>{(stats.owned ?? 0).toFixed(1)}%</Text>
        </View>
      </View>

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
  name: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  team: { fontSize: 15, color: COLORS.textSecondary, marginTop: 2 },
  injBanner: {
    backgroundColor: COLORS.danger + '22', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 8,
  },
  injText: { color: COLORS.danger, fontWeight: '600', fontSize: 13 },
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
});
