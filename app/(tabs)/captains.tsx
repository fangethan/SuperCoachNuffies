import React, { useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePlayers } from '../../src/hooks/usePlayers';
import { COLORS, POSITIONS, CURRENT_YEAR, CURRENT_ROUND } from '../../src/constants';
import { getCaptainRating, formatPrice } from '../../src/utils/scoring';
import { Player } from '../../src/types';
import { PositionFilterBar } from '../../src/components/PositionFilter';
import { useAppStore } from '../../src/store/useAppStore';

interface CaptainCandidate {
  player: Player;
  rating: number;
  projectedDouble: number;
}

export default function CaptainsScreen() {
  const router = useRouter();
  const { positionFilter } = useAppStore();
  const { data: players, isLoading } = usePlayers(CURRENT_YEAR, CURRENT_ROUND);

  const candidates = useMemo<CaptainCandidate[]>(() => {
    if (!players) return [];
    return players
      .filter(p => {
        if (!p.active || p.injury_suspension_status) return false;
        if (positionFilter !== 'ALL' && !p.positions?.some(pos => pos.position === positionFilter)) return false;
        const stats = p.player_stats?.[0];
        return stats && stats.total_games >= 2 && stats.avg3 > 60;
      })
      .map(player => {
        const stats = player.player_stats[0];
        const rating = getCaptainRating(
          stats.avg3, stats.avg5, stats.oppavg, stats.venavg, stats.togp
        );
        return { player, rating, projectedDouble: Math.round(stats.avg3 * 2) };
      })
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 30);
  }, [players, positionFilter]);

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>
        Best captain picks for Round {CURRENT_ROUND} — ranked by form, matchup & venue
      </Text>
      <PositionFilterBar />
      <FlatList
        data={candidates}
        keyExtractor={item => String(item.player.id)}
        renderItem={({ item, index }) => {
          const stats = item.player.player_stats[0];
          const pos = item.player.positions?.[0]?.position ?? 'MID';
          const posColor = POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary;
          const isCaptain = index === 0;
          const isVC = index === 1;

          return (
            <TouchableOpacity
              style={[styles.card, isCaptain && styles.captainCard, isVC && styles.vcCard]}
              onPress={() => router.push(`/player/${item.player.id}`)}
              activeOpacity={0.75}
            >
              {/* Badge */}
              <View style={styles.badgeCol}>
                {isCaptain && <View style={[styles.badge, { backgroundColor: COLORS.gold }]}><Text style={styles.badgeText}>C</Text></View>}
                {isVC && <View style={[styles.badge, { backgroundColor: COLORS.silver }]}><Text style={styles.badgeText}>VC</Text></View>}
                {!isCaptain && !isVC && (
                  <Text style={styles.rankNum}>#{index + 1}</Text>
                )}
                <View style={[styles.posBadge, { backgroundColor: posColor }]}>
                  <Text style={styles.posText}>{pos}</Text>
                </View>
              </View>

              {/* Info */}
              <View style={styles.info}>
                <Text style={styles.name}>{item.player.first_name} {item.player.last_name}</Text>
                <Text style={styles.team}>{item.player.team.abbrev} · {formatPrice(stats.price)}</Text>
                <View style={styles.statsRow}>
                  <StatChip label="L3" value={stats.avg3.toFixed(0)} />
                  <StatChip label="L5" value={stats.avg5.toFixed(0)} />
                  <StatChip label="vs" value={`${stats.opp?.abbrev} ${stats.oppavg.toFixed(0)}`} highlight={stats.oppavg > 75} />
                </View>
              </View>

              {/* Rating + projected */}
              <View style={styles.right}>
                <Text style={styles.projected}>{item.projectedDouble}</Text>
                <Text style={styles.projLabel}>proj 2×</Text>
                <View style={styles.ratingBar}>
                  <View style={[styles.ratingFill, { width: `${item.rating}%` as any }]} />
                </View>
                <Text style={styles.ratingNum}>{item.rating}/100</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function StatChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[chipStyles.chip, highlight && chipStyles.highlight]}>
      <Text style={chipStyles.label}>{label}</Text>
      <Text style={[chipStyles.value, highlight && chipStyles.highlightText]}>{value}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    gap: 3,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  highlight: { backgroundColor: COLORS.success + '22' },
  label: { fontSize: 10, color: COLORS.textMuted },
  value: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },
  highlightText: { color: COLORS.success },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 16, paddingTop: 12 },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  list: { paddingBottom: 20 },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  captainCard: { borderColor: COLORS.gold, borderWidth: 2 },
  vcCard: { borderColor: COLORS.silver, borderWidth: 1.5 },
  badgeCol: { width: 44, alignItems: 'center', marginRight: 10, gap: 4 },
  badge: { borderRadius: 16, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontWeight: '900', fontSize: 14, color: COLORS.background },
  rankNum: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  posBadge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  posText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  info: { flex: 1, marginRight: 8 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 2 },
  team: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 },
  statsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  right: { alignItems: 'flex-end' },
  projected: { fontSize: 22, fontWeight: '800', color: COLORS.gold },
  projLabel: { fontSize: 10, color: COLORS.textMuted, marginBottom: 6 },
  ratingBar: {
    width: 60, height: 4, backgroundColor: COLORS.border,
    borderRadius: 2, overflow: 'hidden', marginBottom: 3,
  },
  ratingFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  ratingNum: { fontSize: 10, color: COLORS.textSecondary },
});
