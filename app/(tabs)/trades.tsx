import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePlayers, useByeRounds } from '../../src/hooks/usePlayers';
import { getTradeInTargets, getTradeOutTargets } from '../../src/utils/trade';
import { COLORS, POSITIONS, CURRENT_YEAR, CURRENT_ROUND } from '../../src/constants';
import { formatPrice, formatPriceChange, getPriceDirection } from '../../src/utils/scoring';
import { PositionFilter } from '../../src/types';

const POSITIONS_FILTER: PositionFilter[] = ['ALL', 'DEF', 'MID', 'FWD', 'RUC'];

export default function TradesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [posFilter, setPosFilter] = useState<PositionFilter>('ALL');

  const { data: players, isLoading } = usePlayers(CURRENT_YEAR, CURRENT_ROUND);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);

  const tradeIn = useMemo(() => {
    if (!players) return [];
    return getTradeInTargets(players, posFilter);
  }, [players, posFilter]);

  const tradeOut = useMemo(() => {
    if (!players) return [];
    // For demo, treat all players as "my team" — replace with actual team when auth is set up
    return getTradeOutTargets(players.slice(0, 22), byeMap ?? {}, CURRENT_ROUND);
  }, [players, byeMap]);

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const data = tab === 'in' ? tradeIn : tradeOut;

  return (
    <View style={styles.container}>
      {/* Tab toggle */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'in' && styles.tabActive]}
          onPress={() => setTab('in')}
        >
          <Text style={[styles.tabLabel, tab === 'in' && styles.tabLabelActive]}>Trade IN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'out' && styles.tabActiveOut]}
          onPress={() => setTab('out')}
        >
          <Text style={[styles.tabLabel, tab === 'out' && styles.tabLabelActiveOut]}>Trade OUT</Text>
        </TouchableOpacity>
      </View>

      {/* Position filter (trade in only) */}
      {tab === 'in' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.posRow}>
          {POSITIONS_FILTER.map(pos => {
            const active = posFilter === pos;
            const color = pos === 'ALL' ? COLORS.primary : POSITIONS[pos as keyof typeof POSITIONS]?.color;
            return (
              <TouchableOpacity
                key={pos}
                style={[styles.posPill, active && { backgroundColor: color + '22', borderColor: color }]}
                onPress={() => setPosFilter(pos)}
              >
                <Text style={[styles.posLabel, active && { color }]}>{pos}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <FlatList
        data={data}
        keyExtractor={item => String(item.player.id)}
        renderItem={({ item, index }) => {
          const stats = item.stats;
          const priceDir = getPriceDirection(stats.price_change);
          const pos = item.player.positions?.[0]?.position ?? 'MID';
          const posColor = POSITIONS[pos as keyof typeof POSITIONS]?.color ?? COLORS.primary;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/player/${item.player.id}`)}
              activeOpacity={0.75}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardRank}>#{index + 1}</Text>
                <View style={[styles.posBadge, { backgroundColor: posColor }]}>
                  <Text style={styles.posText}>{pos}</Text>
                </View>
              </View>

              <View style={styles.cardInfo}>
                <Text style={styles.playerName}>
                  {item.player.first_name} {item.player.last_name}
                </Text>
                <Text style={styles.playerMeta}>
                  {item.player.team.abbrev} · {formatPrice(stats.price)}
                  {stats.price_change !== 0 && (
                    <Text style={priceDir === 'up' ? styles.up : styles.down}>
                      {' '}{formatPriceChange(stats.price_change)}
                    </Text>
                  )}
                </Text>
                {/* Reasons */}
                {item.reasons.slice(0, 2).map((r, i) => (
                  <Text key={i} style={styles.reason}>· {r}</Text>
                ))}
              </View>

              <View style={styles.cardRight}>
                <Text style={styles.avg3}>{stats.avg3.toFixed(0)}</Text>
                <Text style={styles.avgLabel}>L3 avg</Text>
                <Text style={styles.be}>BE {stats.ppts}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 16, paddingTop: 12 },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  tabs: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  tabActive: { backgroundColor: COLORS.success + '22', borderColor: COLORS.success },
  tabActiveOut: { backgroundColor: COLORS.danger + '22', borderColor: COLORS.danger },
  tabLabel: { fontWeight: '700', fontSize: 14, color: COLORS.textMuted },
  tabLabelActive: { color: COLORS.success },
  tabLabelActiveOut: { color: COLORS.danger },
  posRow: { marginBottom: 10, flexGrow: 0 },
  posPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    borderColor: COLORS.border, marginRight: 8,
  },
  posLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  list: { paddingBottom: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardLeft: { width: 44, alignItems: 'center', marginRight: 10, gap: 4 },
  cardRank: { fontSize: 11, color: COLORS.textMuted },
  posBadge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  posText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  cardInfo: { flex: 1, marginRight: 8 },
  playerName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 2 },
  playerMeta: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 3 },
  reason: { fontSize: 11, color: COLORS.textMuted, lineHeight: 18 },
  up: { color: COLORS.success },
  down: { color: COLORS.danger },
  cardRight: { alignItems: 'flex-end' },
  avg3: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  avgLabel: { fontSize: 10, color: COLORS.textMuted, marginBottom: 4 },
  be: { fontSize: 11, color: COLORS.textSecondary },
});
