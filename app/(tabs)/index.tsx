import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TextInput,
  TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, ScrollView, Pressable,
} from 'react-native';
import { usePlayers, useByeRounds, useFilteredPlayers, useFootywireBreakevens, useMatchList } from '../../src/hooks/usePlayers';
import { useRoundScores } from '../../src/hooks/useRoundScores';
import { footywireApi } from '../../src/api/footywire';
import { PlayerCard } from '../../src/components/PlayerCard';
import { PositionFilterBar } from '../../src/components/PositionFilter';
import { useAppStore } from '../../src/store/useAppStore';
import { COLORS, CURRENT_YEAR } from '../../src/constants';
import { SortOption, Player } from '../../src/types';

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Total Pts', value: 'total_pts' },
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
  total_pts: 'total pts',
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
  const { searchQuery, setSearchQuery, sortBy, setSortBy, sortAscending, toggleSortDirection, maxRound, myTeamIds, showOwnedOnly, setShowOwnedOnly } = useAppStore();

  // Local round state — only used for "Rnd X Pts" sort, nothing else
  const lastCompletedRound = Math.max(1, maxRound - 1);
  const [scoreRound, setScoreRound] = useState(lastCompletedRound);
  const [roundModalOpen, setRoundModalOpen] = useState(false);

  const { data: players, isLoading, error } = usePlayers(CURRENT_YEAR, maxRound);
  const { data: byeMap } = useByeRounds(CURRENT_YEAR);
  const { data: fwMap } = useFootywireBreakevens();

  // Pre-warm match list cache so player profile matchup stats load instantly
  useMatchList(CURRENT_YEAR);
  useMatchList(2025);
  useMatchList(2024);

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

  // Fetch scores through scoreRound (the specific round being viewed)
  const { data: roundScoresById, isLoading: roundScoresLoading } = useRoundScores(CURRENT_YEAR, scoreRound, players ?? []);

  const filtered = useFilteredPlayers(players ?? [], weeklyPriceMap, fwBreakevenById, roundScoresById, roundScoresLoading, scoreRound);

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
        scoreRound={scoreRound}
      />
    );
  }, [byeMap, myTeamIds, weeklyPriceMap, fwMap, roundScoresById, scoreRound]);

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
        {SORT_OPTIONS.map(opt => {
          const isPoints = opt.value === 'points';
          const active = sortBy === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.8}
              style={[styles.sortPill, active && styles.sortActive]}
              onPress={() => {
                setSortBy(opt.value);
                if (isPoints) setRoundModalOpen(true);
              }}
            >
              <Text style={[styles.sortLabel, active && styles.sortLabelActive]}>
                {isPoints ? `Rnd ${scoreRound} Pts ▾` : opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.sortPill, styles.sortDirBtn]}
          onPress={toggleSortDirection}
        >
          <Text style={styles.sortDirLabel}>{sortAscending ? '↑' : '↓'}</Text>
        </TouchableOpacity>
      </View>

      {/* Round picker modal — only for "Rnd X Pts" sort */}
      <Modal visible={roundModalOpen} transparent animationType="fade" onRequestClose={() => setRoundModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRoundModalOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Select Round</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
              {Array.from({ length: lastCompletedRound }, (_, i) => lastCompletedRound - i).map(r => {
                const active = r === scoreRound;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.modalItem, active && styles.modalItemActive]}
                    onPress={() => { setScoreRound(r); setRoundModalOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>Round {r}</Text>
                    {active && <Text style={styles.modalCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 220,
    maxHeight: 420,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  modalItemActive: { backgroundColor: COLORS.primary + '18' },
  modalItemText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  modalItemTextActive: { color: COLORS.primary },
  modalCheck: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
});
