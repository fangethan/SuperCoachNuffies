import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Player } from '../types';
import { COLORS, POSITIONS } from '../constants';
import { formatPrice, formatPriceChange, getPriceDirection } from '../utils/scoring';
import { useAppStore } from '../store/useAppStore';
import { TeamBadge } from './TeamBadge';

interface Props {
  player: Player;
  byeRounds?: number[];
  rank?: number;
  isOwned?: boolean;
  weeklyPriceChange?: number;
  fwInjuryStatus?: 'INJ' | 'SUS' | null;
  fwBreakeven?: number;
  roundScores?: { avg5: number; lastScore: number };
}

export const PlayerCard = memo(function PlayerCard({ player, byeRounds, rank, isOwned, weeklyPriceChange, fwInjuryStatus, fwBreakeven, roundScores }: Props) {
  const router = useRouter();
  const sortBy = useAppStore(s => s.sortBy);
  const currentRound = useAppStore(s => s.currentRound);
  const stats = player.player_stats?.[0];
  const positions = player.positions?.map(p => p.position) ?? ['MID'];

  const futureByeRounds = (byeRounds ?? []).filter(r => r > currentRound);

  // Dynamic stat shown on the right based on the active sort
  const { primaryValue, primaryLabel, primaryColor, secondaryValue } = (() => {
    if (!stats) return { primaryValue: '-', primaryLabel: 'avg', primaryColor: COLORS.textPrimary, secondaryValue: null };
    switch (sortBy) {
      case 'avg3':
        return {
          primaryValue: (stats.avg3 ?? 0) > 0 ? stats.avg3!.toFixed(1) : 'N/A',
          primaryLabel: 'L3 avg',
          primaryColor: COLORS.textPrimary,
        };
      case 'avg5': {
        const a5 = roundScores?.avg5 ?? 0;
        return {
          primaryValue: a5 > 0 ? a5.toFixed(1) : 'N/A',
          primaryLabel: 'L5 avg',
          primaryColor: COLORS.textPrimary,
        };
      }
      case 'points': {
        const roundScore = roundScores?.lastScore ?? 0;
        return {
          primaryValue: roundScore > 0 ? String(roundScore) : 'N/A',
          primaryLabel: 'score',
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
          primaryLabel: '±$ Change',
          primaryColor: col,
          secondaryValue: total !== 0 ? { text: `(${formatPriceChange(total)})`, color: totalCol } : null,
        };
      }
      case 'owned':
        return { primaryValue: `${(stats.owned ?? 0).toFixed(1)}%`, primaryLabel: 'owned', primaryColor: COLORS.textPrimary };
      case 'ppts': {
        const be = fwBreakeven ?? stats.ppts ?? null;
        return {
          primaryValue: be !== null && be !== 0 ? String(be) : '-',
          primaryLabel: 'BE',
          primaryColor: be !== null && be > (stats.avg3 ?? 0) ? COLORS.danger : COLORS.success,
        };
      }
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
      {/* Left: rank + position(s) */}
      <View style={styles.left}>
        {rank !== undefined ? (
          <Text style={styles.rank}>#{rank}</Text>
        ) : null}
        {positions.length > 1 ? (
          <View style={styles.dppBadge}>
            {positions.map((pos, i) => {
              const cfg = POSITIONS[pos as keyof typeof POSITIONS];
              return (
                <React.Fragment key={pos}>
                  {i > 0 && <Text style={styles.dppSlash}>/</Text>}
                  <Text style={[styles.dppText, { color: cfg?.color ?? COLORS.textMuted }]}>{pos}</Text>
                </React.Fragment>
              );
            })}
          </View>
        ) : (
          <View style={[styles.positionBadge, { backgroundColor: POSITIONS[positions[0] as keyof typeof POSITIONS]?.color ?? COLORS.textMuted }]}>
            <Text style={styles.positionText}>{positions[0]}</Text>
          </View>
        )}
      </View>

      {/* Centre: name + team + price */}
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
          <TeamBadge teamName={player.team?.name ?? ''} abbrev={player.team?.abbrev ?? ''} size={20} />
          <Text style={styles.team}>{player.team?.abbrev ?? ''}</Text>
          {(() => {
            const scInj = player.injury_suspension_status;
            const isSusp = fwInjuryStatus === 'SUS' || (!fwInjuryStatus && /susp/i.test((scInj ?? '') + (player.injury_suspension_status_text ?? '')));
            const isInj = fwInjuryStatus === 'INJ' || (!fwInjuryStatus && !!scInj && !isSusp);
            if (isSusp) return (
              <View style={styles.suspBadge}>
                <Text style={styles.suspText}>SUSP</Text>
              </View>
            );
            if (isInj) return (
              <View style={styles.injBadge}>
                <Text style={styles.injCross}>✚</Text>
              </View>
            );
            return null;
          })()}
          {futureByeRounds.map(r => (
            <View key={r} style={styles.byeBadge}>
              <Text style={styles.byeText}>BYE R{r}</Text>
            </View>
          ))}
        </View>
        {stats ? (() => {
          const price = stats.price ?? 0;
          const total = stats.total_price_change ?? 0;
          const weekly = weeklyPriceChange ?? stats.price_change ?? 0;
          const totalDir = getPriceDirection(total);
          const weeklyDir = getPriceDirection(weekly);
          const totalCol = totalDir === 'up' ? COLORS.success : totalDir === 'down' ? COLORS.danger : COLORS.textMuted;
          const weeklyCol = weeklyDir === 'up' ? COLORS.success : weeklyDir === 'down' ? COLORS.danger : COLORS.textMuted;
          return (
            <View style={styles.priceRow}>
              <Text style={styles.priceText}>{formatPrice(price)}</Text>
              {total !== 0 ? (
                <Text style={[styles.priceChange, { color: totalCol }]}> {formatPriceChange(total)}</Text>
              ) : null}
              {weekly !== 0 ? (
                <Text style={[styles.priceWeekly, { color: weeklyCol }]}> ({formatPriceChange(weekly)})</Text>
              ) : null}
            </View>
          );
        })() : null}
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
    marginRight: 14,
    width: 54,
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
  dppBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dppText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dppSlash: {
    fontSize: 10,
    fontWeight: '300',
    color: COLORS.textMuted,
    marginHorizontal: 2,
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
    marginLeft: 5,
    marginRight: 6,
  },
  injBadge: {
    backgroundColor: COLORS.danger + '33',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 6,
  },
  injCross: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '700',
  },
  suspBadge: {
    backgroundColor: COLORS.danger + '33',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 6,
  },
  suspText: {
    fontSize: 10,
    color: COLORS.danger,
    fontWeight: '700',
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    flexWrap: 'nowrap',
  },
  priceText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  priceChange: {
    fontSize: 11,
    fontWeight: '700',
  },
  priceWeekly: {
    fontSize: 10,
    fontWeight: '500',
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
