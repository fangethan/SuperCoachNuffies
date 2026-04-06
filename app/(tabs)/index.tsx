import React, { useCallback } from 'react';
import {
  View, Text, FlatList, TextInput,
  TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { usePlayers, useByeRounds, useFilteredPlayers } from '../../src/hooks/usePlayers';
import { useCurrentRound } from '../../src/hooks/useCurrentRound';
import { PlayerCard } from '../../src/components/PlayerCard';
import { PositionFilterBar } from '../../src/components/PositionFilter';
import { useAppStore } from '../../src/store/useAppStore';
import { COLORS, CURRENT_YEAR } from '../../src/constants';
import { SortOption, Player } from '../../src/types';

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Avg', value: 'avg' },
  { label: 'L3', value: 'avg3' },
  { label: 'L5', value: 'avg5' },
  { label: 'Score', value: 'points' },
  { label: 'Price', value: 'price' },
  { label: '±$', value: 'price_change' },
  { label: 'Own%', value: 'owned' },
  { label: 'BE', value: 'ppts' },
];

export default function PlayersScreen() {
  const { searchQuery, setSearchQuery, sortBy, setSortBy, currentRound, setCurrentRound } = useAppStore();

  // Auto-detect current round
  const { data: detectedRound } = useCurrentRound(CURRENT_YEAR);
  const round = detectedRound ?? currentRound;

  const { data: players, isLoading, error } = usePlayers(CURRENT_YEAR, round);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);
  const filtered = useFilteredPlayers(players ?? []);

  // Memoised render for FlatList performance
  const renderItem = useCallback(({ item, index }: { item: Player; index: number }) => (
    <PlayerCard
      player={item}
      rank={index + 1}
      byeRound={byeMap?.[item.team?.name ?? '']}
    />
  ), [byeMap]);

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

      {/* Position filter */}
      <PositionFilterBar />

      {/* Sort options */}
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.8}
            style={[styles.sortPill, sortBy === opt.value && styles.sortActive]}
            onPress={() => setSortBy(opt.value)}
          >
            <Text style={[styles.sortLabel, sortBy === opt.value && styles.sortLabelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.count}>{filtered.length} players</Text>

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
          length: 76,
          offset: 76 * index,
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
  count: { fontSize: 12, color: COLORS.textMuted, marginBottom: 8 },
  list: { paddingBottom: 20 },
});
