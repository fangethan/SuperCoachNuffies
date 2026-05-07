import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { footywireApi, PlayerRoundScores } from '../api/footywire';
import { Player } from '../types';
import { deleteJson, getJson, setJson } from '../store/cache';
import { useAppStore } from '../store/useAppStore';
import { CURRENT_YEAR } from '../constants';

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
): {
  data: Record<number, PlayerRoundScores>;
  isLoading: boolean;
  /**
   * Force-refresh this round's scores: wipes the SQLite cache row
   * and re-runs the React Query fetch. Used by the player profile
   * to recover when a match has finished but the per-player SC
   * score hasn't been published yet at first fetch.
   */
  refresh: () => Promise<void>;
} {
  const playersRef = useRef(players);
  playersRef.current = players;
  const queryClient = useQueryClient();

  // Live round from the store — anything strictly below this is a completed
  // round and its scores are immutable. Reading once at hook-call time is
  // enough; we only re-read on the freshly-fetched scores write below.
  const maxRound = useAppStore(s => s.maxRound);

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

      // Past rounds (prior season, or earlier round in the current season)
      // are frozen — Footywire will never publish a different score for
      // round 3 of 2025 again. Mark those rows permanent so cold start can
      // skip the network. The live round stays on the existing TTL so
      // weekend score updates flow in.
      const isFrozen = year < CURRENT_YEAR || targetRound < maxRound;

      try {
        await setJson<StoredScores>(
          RS_KEY(year, targetRound),
          { scores },
          { permanent: isFrozen },
        );
      } catch { /* ignore */ }

      return scores;
    },
    enabled: players.length > 0 && targetRound > 0,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    placeholderData: (prev) => prev,
  });

  const refresh = useCallback(async () => {
    try {
      await deleteJson(RS_KEY(year, targetRound));
    } catch { /* ignore */ }
    await queryClient.invalidateQueries({
      queryKey: ['round-scores', 'v5', year, targetRound],
    });
  }, [queryClient, year, targetRound]);

  return {
    data: query.data ?? {},
    isLoading: query.isLoading,
    refresh,
  };
}
