import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { footywireApi, PlayerRoundScores } from '../api/footywire';
import { Player } from '../types';
import { getJson, setJson } from '../store/cache';

// Per-(year, round) cache entry. Keying by year+round means flipping between
// rounds via the round picker doesn't blow away the previous round's cache.
const RS_KEY = (year: number, round: number) => `rs:${year}_${round}`;

interface StoredScores {
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
        const stored = await getJson<StoredScores>(RS_KEY(year, targetRound));
        if (stored && Object.values(stored.scores).some(s => s.lastScore > 0)) {
          return stored.scores;
        }
      } catch { /* ignore storage errors */ }

      const scores = await footywireApi.fetchRoundScoresBulk(
        year,
        targetRound,
        playersRef.current,
      );

      try {
        await setJson<StoredScores>(RS_KEY(year, targetRound), { scores });
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
