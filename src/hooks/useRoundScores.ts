import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { footywireApi, PlayerRoundScores } from '../api/footywire';
import { Player } from '../types';

const STORAGE_KEY = 'round_scores_v4';

interface StoredScores {
  year: number;
  round: number;
  scores: Record<number, PlayerRoundScores>;
}

/**
 * Fetches and caches round scores with two-level caching:
 *  1. React Query in-memory cache (staleTime: Infinity within a session)
 *  2. AsyncStorage on-device cache (survives app restarts)
 *
 * The queryKey includes `lastCompleteRound` so React Query automatically
 * triggers a re-fetch only when the round advances — giving "once per round"
 * behaviour with no manual scheduling needed.
 */
export function useRoundScores(
  year: number,
  currentRound: number,
  players: Player[],
): { data: Record<number, PlayerRoundScores>; isLoading: boolean } {
  // Keep a stable ref so the async queryFn always sees the latest players list
  const playersRef = useRef(players);
  playersRef.current = players;

  // The last *completed* round: if the API says round 8, round 7 is fully done
  const lastCompleteRound = Math.max(1, currentRound - 1);

  const query = useQuery<Record<number, PlayerRoundScores>>({
    queryKey: ['round-scores', 'v4', year, lastCompleteRound],
    queryFn: async () => {
      // 1. Check on-device cache — zero network if round hasn't changed
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored: StoredScores = JSON.parse(raw);
          const hasValidScores = Object.values(stored.scores).some(s => s.lastScore > 0);
          if (stored.year === year && stored.round === lastCompleteRound && hasValidScores) {
            console.log('[RoundScores] cache hit round', lastCompleteRound);
            return stored.scores;
          }
        }
      } catch { /* ignore storage errors */ }

      // 2. Fetch: 5 bulk requests (one per round) instead of 800 player pages
      const scores = await footywireApi.fetchRoundScoresBulk(
        year,
        lastCompleteRound,
        playersRef.current,
      );

      // 3. Persist so the next cold start skips the network entirely
      try {
        const payload: StoredScores = { year, round: lastCompleteRound, scores };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch { /* ignore */ }

      return scores;
    },
    enabled: players.length > 0 && currentRound > 1,
    staleTime: Infinity,           // never re-fetch while queryKey is unchanged
    gcTime: 1000 * 60 * 60 * 24 * 7, // keep in memory for 7 days
    placeholderData: (prev) => prev,  // show last round's data while loading new round
  });

  return {
    data: query.data ?? {},
    isLoading: query.isLoading,
  };
}
