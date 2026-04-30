import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { footywireApi, PlayerRoundScores } from '../api/footywire';
import { Player } from '../types';

const STORAGE_KEY = 'round_scores_v6';

interface StoredScores {
  year: number;
  round: number;
  scores: Record<number, PlayerRoundScores>;
}

// Fetches scores through `targetRound` (inclusive). The caller decides
// which round to pass — the index screen passes `scoreRound` which accounts
// for whether the user has picked a historical round or the live round.
export function useRoundScores(
  year: number,
  targetRound: number,
  players: Player[],
): { data: Record<number, PlayerRoundScores>; isLoading: boolean } {
  const playersRef = useRef(players);
  playersRef.current = players;

  const query = useQuery<Record<number, PlayerRoundScores>>({
    queryKey: ['round-scores', 'v5', year, targetRound],
    queryFn: async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored: StoredScores = JSON.parse(raw);
          const hasValidScores = Object.values(stored.scores).some(s => s.lastScore > 0);
          if (stored.year === year && stored.round === targetRound && hasValidScores) {
            return stored.scores;
          }
        }
      } catch { /* ignore storage errors */ }

      const scores = await footywireApi.fetchRoundScoresBulk(
        year,
        targetRound,
        playersRef.current,
      );

      try {
        const payload: StoredScores = { year, round: targetRound, scores };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch { /* ignore */ }

      return scores;
    },
    enabled: players.length > 0 && targetRound > 0,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    placeholderData: (prev) => prev,
  });

  return {
    data: query.data ?? {},
    isLoading: query.isLoading,
  };
}
