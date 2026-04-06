import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Player } from '../types';
import { COLORS, POSITIONS } from '../constants';
import { formatPriceChange, getPriceDirection } from '../utils/scoring';

interface Props {
  player: Player;
  byeRound?: number;
  rank?: number;
}

export const PlayerCard = memo(function PlayerCard({ player, byeRound, rank }: Props) {
  const router = useRouter();
  const stats = player.player_stats?.[0];
  const position = player.positions?.[0]?.position ?? 'MID';
  const posConfig = POSITIONS[position as keyof typeof POSITIONS];
  const priceDir = stats ? getPriceDirection(stats.price_change) : 'neutral';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/player/${player.id}`)}
      activeOpacity={1}
    >
      {/* Left: rank + position */}
      <View style={styles.left}>
        {rank !== undefined && (
          <Text style={styles.rank}>#{rank}</Text>
        )}
        <View style={[styles.positionBadge, { backgroundColor: posConfig?.color ?? COLORS.textMuted }]}>
          <Text style={styles.positionText}>{position}</Text>
        </View>
      </View>

      {/* Centre: name + team */}
      <View style={styles.centre}>
        <Text style={styles.name} numberOfLines={1}>
          {player.first_name} {player.last_name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.team}>{player.team?.abbrev ?? ''}</Text>
          {player.injury_suspension_status ? (
            <View style={styles.injBadge}>
              <Text style={styles.injText}>{player.injury_suspension_status}</Text>
            </View>
          ) : null}
          {byeRound ? (
            <View style={styles.byeBadge}>
              <Text style={styles.byeText}>BYE R{byeRound}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Right: score + price */}
      {stats ? (
        <View style={styles.right}>
          <Text style={styles.score}>{stats.points ?? '-'}</Text>
          <Text style={styles.avg}>avg {stats.avg3?.toFixed(0) ?? '-'}</Text>
          <Text style={[
            styles.priceChange,
            priceDir === 'up' ? styles.up : priceDir === 'down' ? styles.down : styles.neutral,
          ]}>
            {formatPriceChange(stats.price_change)}
          </Text>
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
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 3,
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
  },
  score: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  avg: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  priceChange: {
    fontSize: 12,
    fontWeight: '600',
  },
  up: { color: COLORS.success },
  down: { color: COLORS.danger },
  neutral: { color: COLORS.textMuted },
});
