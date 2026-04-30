import React, { useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput,
  TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { usePlayers, useByeRounds, useFilteredPlayers, useFootywireBreakevens, useMatchList } from '../../src/hooks/usePlayers';
import { useRoundScores } from '../../src/hooks/useRoundScores';
import { footywireApi } from '../../src/api/footywire';
import { useCurrentRound } from '../../src/hooks/useCurrentRound';
import { PlayerCard } from '../../src/components/PlayerCard';
import { PositionFilterBar } from '../../src/components/PositionFilter';
import { useAppStore } from '../../src/store/useAppStore';
import { COLORS, CURRENT_YEAR } from '../../src/constants';
import { SortOption, Player } from '../../src/types';

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Avg', value: 'avg' },
  { label: '3 Rd Avg', value: 'avg3' },
  { label: '5 Rd Avg', value: 'avg5' },
  { label: 'Score', value: 'points' },   // label overridden in render with dynamic round
  { label: 'Price', value: 'price' },
  { label: '±$ Change', value: 'price_change' },
  { label: 'Own%', value: 'owned' },
  { label: 'Breakeven', value: 'ppts' },
];

// Sort option short labels shown on card
export const SORT_CARD_LABEL: Record<SortOption, string> = {
  avg: 'avg',
  avg3: '3 Rd Avg',
  avg5: '5 Rd Avg',
  points: 'Rnd Pts',
  price: 'price',
  price_change: '±$ Change',
  owned: 'owned',
  ppts: 'Breakeven',
};

export default function PlayersScreen() {
  const { searchQuery, setSearchQuery, sortBy, setSortBy, sortAscending, toggleSortDirection, currentRound, setCurrentRound, myTeamIds, showOwnedOnly, setShowOwnedOnly } = useAppStore();

  // Auto-detect current round
  const { data: detectedRound } = useCurrentRound(CURRENT_YEAR);
  const round = detectedRound ?? currentRound;

  const { data: players, isLoading, error } = usePlayers(CURRENT_YEAR, round);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);
  const { data: fwMap } = useFootywireBreakevens();

  // Pre-warm match list cache so player profile matchup stats load instantly
  useMatchList(CURRENT_YEAR);
  useMatchList(2025);
  useMatchList(2024);

  // price_change on each player is already the last-round change from Footywire prices page
  const weeklyPriceMap = useMemo(() => {
    if (!players) return {} as Record<number, number>;
    return Object.fromEntries(
      players.map(p => [p.id, p.player_stats?.[0]?.price_change ?? 0])
    ) as Record<number, number>;
  }, [players]);

  const fwBreakevenById = useMemo(() => {
    if (!players || !fwMap) return {} as Record<number, number>;
    const map: Record<number, number> = {};
    for (const p of players) {
      const fw = footywireApi.lookupPlayer(fwMap, p.first_name, p.last_name);
      if (fw !== undefined) map[p.id] = fw.breakeven;
    }
    return map;
  }, [players, fwMap]);

  // Round scores: fetches once per round, persisted on-device via AsyncStorage
  const { data: roundScoresById, isLoading: roundScoresLoading } = useRoundScores(CURRENT_YEAR, round, players ?? []);

  const filtered = useFilteredPlayers(players ?? [], weeklyPriceMap, fwBreakevenById, roundScoresById, roundScoresLoading);

  // Memoised render for FlatList performance
  const renderItem = useCallback(({ item, index }: { item: Player; index: number }) => {
    const fw = fwMap ? footywireApi.lookupPlayer(fwMap, item.first_name, item.last_name) : undefined;
    return (
      <PlayerCard
        player={item}
        rank={index + 1}
        byeRounds={byeMap?.[item.team?.name ?? '']}
        isOwned={myTeamIds.includes(item.id)}
        weeklyPriceChange={weeklyPriceMap[item.id]}
        fwInjuryStatus={fw?.injuryStatus ?? null}
        fwBreakeven={fw?.breakeven}
        roundScores={roundScoresById[item.id]}
      />
    );
  }, [byeMap, myTeamIds, weeklyPriceMap, fwMap, roundScoresById]);

  const keyExtractor = useCallback((item: Player) => String(item.id), []);

  if (isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>Loading players...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorText}>Failed to load players. Check your connection.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Round indicator */}
      <View style={styles.roundRow}>
        <Text style={styles.roundLabel}>Round {round}</Text>
        <View style={styles.roundDot} />
        <Text style={styles.roundSub}>Live data</Text>
      </View>

      {/* Search */}
      <TextInput
        style={styles.search}
        placeholder="Search player or team..."
        placeholderTextColor={COLORS.textMuted}
        value={searchQuery}
        onChangeText={setSearchQuery}
        clearButtonMode="while-editing"
      />

      {/* Position filter + Owned toggle */}
      <View style={styles.filterRow}>
        <PositionFilterBar />
        {myTeamIds.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.ownedToggle, showOwnedOnly && styles.ownedToggleActive]}
            onPress={() => setShowOwnedOnly(!showOwnedOnly)}
          >
            <Text style={[styles.ownedToggleLabel, showOwnedOnly && styles.ownedToggleLabelActive]}>
              My Team
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Sort options + direction toggle */}
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.8}
            style={[styles.sortPill, sortBy === opt.value && styles.sortActive]}
            onPress={() => setSortBy(opt.value)}
          >
            <Text style={[styles.sortLabel, sortBy === opt.value && styles.sortLabelActive]}>
              {opt.value === 'points' ? `Rnd ${Math.max(1, round - 1)} Pts` : opt.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.sortPill, styles.sortDirBtn]}
          onPress={toggleSortDirection}
        >
          <Text style={styles.sortDirLabel}>{sortAscending ? '↑' : '↓'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.count}>
        {filtered.length} players{roundScoresLoading && (sortBy === 'points' || sortBy === 'avg5') ? ' • loading scores…' : ''}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={true}
        getItemLayout={(_, index) => ({
          length: 96,
          offset: 96 * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.background },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { color: COLORS.textSecondary, marginTop: 12, fontSize: 15 },
  errorText: { color: COLORS.danger, textAlign: 'center', padding: 20 },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  roundLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  roundDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.success,
    marginHorizontal: 6,
  },
  roundSub: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  search: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8, marginTop: 4 },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 6,
    marginBottom: 6,
  },
  sortActive: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary },
  sortLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  sortLabelActive: { color: COLORS.primary },
  sortDirBtn: { borderColor: COLORS.border, minWidth: 36, alignItems: 'center' },
  sortDirLabel: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '700' },
  count: { fontSize: 12, color: COLORS.textMuted, marginBottom: 8 },
  list: { paddingBottom: 20 },
  filterRow: { flexDirection: 'row', alignItems: 'center' },
  ownedToggle: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
    marginLeft: 8, marginBottom: 8,
  },
  ownedToggleActive: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary },
  ownedToggleLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  ownedToggleLabelActive: { color: COLORS.primary },
});
