import React, { useState } from 'react';
import {
  View, Text, FlatList, TextInput,
  TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { usePlayers, useByeRounds, useFilteredPlayers } from '../../src/hooks/usePlayers';
import { PlayerCard } from '../../src/components/PlayerCard';
import { PositionFilterBar } from '../../src/components/PositionFilter';
import { useAppStore } from '../../src/store/useAppStore';
import { COLORS, CURRENT_ROUND, CURRENT_YEAR } from '../../src/constants';
import { SortOption } from '../../src/types';

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
  const { searchQuery, setSearchQuery, sortBy, setSortBy } = useAppStore();
  const { data: players, isLoading, error } = usePlayers(CURRENT_YEAR, CURRENT_ROUND);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);
  const filtered = useFilteredPlayers(players ?? []);

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
      {/* Search */}
      <TextInput
        style={styles.search}
        placeholder="Search player or team..."
        placeholderTextColor={COLORS.textMuted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {/* Position filter */}
      <PositionFilterBar />

      {/* Sort options */}
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
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
        keyExtractor={item => String(item.id)}
        renderItem={({ item, index }) => (
          <PlayerCard
            player={item}
            rank={index + 1}
            byeRound={byeMap?.[item.team.name]}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.background },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { color: COLORS.textSecondary, marginTop: 12, fontSize: 15 },
  errorText: { color: COLORS.danger, textAlign: 'center', padding: 20 },
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
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortActive: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary },
  sortLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  sortLabelActive: { color: COLORS.primary },
  count: { fontSize: 12, color: COLORS.textMuted, marginBottom: 8 },
  list: { paddingBottom: 20 },
});
