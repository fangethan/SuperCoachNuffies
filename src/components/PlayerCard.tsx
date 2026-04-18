import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Player } from '../types';
import { COLORS, POSITIONS } from '../constants';
import { formatPrice, formatPriceChange, getPriceDirection } from '../utils/scoring';
import { useAppStore } from '../store/useAppStore';

interface Props {
  player: Player;
  byeRound?: number;
  rank?: number;
  isOwned?: boolean;
  weeklyPriceChange?: number;
}

export const PlayerCard = memo(function PlayerCard({ player, byeRound, rank, isOwned, weeklyPriceChange }: Props) {
  const router = useRouter();
  const sortBy = useAppStore(s => s.sortBy);
  const currentRound = useAppStore(s => s.currentRound);
  const stats = player.player_stats?.[0];
  const position = player.positions?.[0]?.position ?? 'MID';
  const posConfig = POSITIONS[position as keyof typeof POSITIONS];

  // Only show a bye if it's in the future
  const futureBye = byeRound && byeRound > currentRound ? byeRound : undefined;

  // Dynamic stat shown on the right based on the active sort
  const { primaryValue, primaryLabel, primaryColor, secondaryValue } = (() => {
    if (!stats) return { primaryValue: '-', primaryLabel: 'avg', primaryColor: COLORS.textPrimary, secondaryValue: null };
    switch (sortBy) {
      case 'avg3':
        return { primaryValue: stats.avg3?.toFixed(0) ?? '-', primaryLabel: 'L3 avg', primaryColor: COLORS.textPrimary };
      case 'avg5':
        return { primaryValue: stats.avg5?.toFixed(0) ?? '-', primaryLabel: 'L5 avg', primaryColor: COLORS.textPrimary };
      case 'points': {
        // Show round score if played, otherwise season total
        const roundScore = stats.points ?? 0;
        const seasonTotal = stats.total_points ?? 0;
        const hasRoundScore = roundScore > 0;
        return {
          primaryValue: hasRoundScore ? String(roundScore) : String(seasonTotal),
          primaryLabel: hasRoundScore ? 'score' : 'total pts',
          primaryColor: COLORS.textPrimary,
        };
      }
      case 'price':
        return { primaryValue: formatPrice(stats.price ?? 0), primaryLabel: 'price', primaryColor: COLORS.textPrimary };
      case 'price_change': {
        // Use previous round's price_change (last calculated weekly change)
        const weekly = weeklyPriceChange ?? stats.price_change ?? 0;
        const total = stats.total_price_change ?? 0;
        const dir = getPriceDirection(weekly);
        const col = dir === 'up' ? COLORS.success : dir === 'down' ? COLORS.danger : COLORS.textMuted;
        const totalDir = getPriceDirection(total);
        const totalCol = totalDir === 'up' ? COLORS.success : totalDir === 'down' ? COLORS.danger : COLORS.textMuted;
        return {
          primaryValue: weekly !== 0 ? formatPriceChange(weekly) : '-',
          primaryLabel: '±$ this week',
          primaryColor: col,
          secondaryValue: total !== 0 ? { text: `(${formatPriceChange(total)})`, color: totalCol } : null,
        };
      }
      case 'owned':
        return { primaryValue: `${(stats.owned ?? 0).toFixed(1)}%`, primaryLabel: 'owned', primaryColor: COLORS.textPrimary };
      case 'ppts':
        return {
          primaryValue: String(stats.ppts ?? '-'),
          primaryLabel: 'BE',
          primaryColor: (stats.ppts ?? 0) > (stats.avg3 ?? 0) ? COLORS.danger : COLORS.success,
        };
      default: // 'avg'
        return { primaryValue: stats.avg?.toFixed(1) ?? '-', primaryLabel: 'avg', primaryColor: COLORS.textPrimary };
    }
  })();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/player/${player.id}`)}
      activeOpacity={0.85}
    >
      {/* Left: rank + position */}
      <View style={styles.left}>
        {rank !== undefined ? (
          <Text style={styles.rank}>#{rank}</Text>
        ) : null}
        <View style={[styles.positionBadge, { backgroundColor: posConfig?.color ?? COLORS.textMuted }]}>
          <Text style={styles.positionText}>{position}</Text>
        </View>
      </View>

      {/* Centre: name + team */}
      <View style={styles.centre}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {player.first_name} {player.last_name}
          </Text>
          {isOwned ? (
            <View style={styles.ownedBadge}>
              <Text style={styles.ownedText}>Owned</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.team}>{player.team?.abbrev ?? ''}</Text>
          {player.injury_suspension_status ? (
            <View style={styles.injBadge}>
              <Text style={styles.injText}>{player.injury_suspension_status}</Text>
            </View>
          ) : null}
          {futureBye ? (
            <View style={styles.byeBadge}>
              <Text style={styles.byeText}>BYE R{futureBye}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Right: dynamic stat based on active sort */}
      {stats ? (
        <View style={styles.right}>
          <Text style={[styles.score, { color: primaryColor }]}>{primaryValue}</Text>
          {secondaryValue ? (
            <Text style={[styles.secondary, { color: secondaryValue.color }]}>{secondaryValue.text}</Text>
          ) : null}
          <Text style={styles.avg}>{primaryLabel}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  left: {
    alignItems: 'center',
    marginRight: 10,
    width: 44,
  },
  rank: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  positionBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  positionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  centre: {
    flex: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  ownedBadge: {
    backgroundColor: COLORS.primary + '22',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  ownedText: {
    fontSize: 9,
    color: COLORS.primary,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  team: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginRight: 6,
  },
  injBadge: {
    backgroundColor: COLORS.danger + '33',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 6,
  },
  injText: {
    fontSize: 10,
    color: COLORS.danger,
    fontWeight: '600',
  },
  byeBadge: {
    backgroundColor: COLORS.warning + '33',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  byeText: {
    fontSize: 10,
    color: COLORS.warning,
    fontWeight: '600',
  },
  right: {
    alignItems: 'flex-end',
    minWidth: 52,
  },
  score: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  secondary: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  avg: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
