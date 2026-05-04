import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supercoachApi } from '../api/supercoach';
import { squiggleApi } from '../api/squiggle';
import { footywireApi, PlayerRoundScores, MatchEntry } from '../api/footywire';
import { Player } from '../types';
import { useAppStore } from '../store/useAppStore';
import { CURRENT_YEAR } from '../constants';
import { getJson, setJson } from '../store/cache';
import { applyPlayerFilters, applyPlayerSort } from '../utils/playerFilterSort';

export { PlayerRoundScores };

export function usePlayers(year: number, round: number) {
  return useQuery({
    queryKey: ['players', 'v12', year, round],
    queryFn: () => supercoachApi.fetchPlayers(year, round),
    staleTime: 1000 * 60 * 30, // 30 min cache
  });
}

export function useMatchList(year: number) {
  return useQuery({
    queryKey: ['match-list', year],
    queryFn: () => footywireApi.fetchMatchList(year),
    // Past seasons never change — cache forever. Current year: 1 hour.
    staleTime: year < CURRENT_YEAR ? Infinity : 1000 * 60 * 60,
  });
}

export function useFootywireBreakevens() {
  return useQuery({
    queryKey: ['footywire', 'breakevens', 'v11'],
    queryFn: () => footywireApi.fetchBreakevenMap(),
    staleTime: 1000 * 60 * 30, // 30 min cache
  });
}

export function useByeRounds(year: number) {
  return useQuery({
    queryKey: ['byes', year],
    queryFn: () => squiggleApi.fetchByeRounds(year),
    staleTime: 1000 * 60 * 60 * 24, // 24h cache — byes don't change
  });
}

export function usePlayerRoundScores(year: number, players: Player[]) {
  return useQuery({
    queryKey: ['player-round-scores', 'v3', year],
    queryFn: () => footywireApi.fetchAllPlayerRoundScores(year, players),
    enabled: players.length > 0,
    staleTime: 1000 * 60 * 30,
  });
}

export function useHistoricalPlayers(playerId: number, years: number[], round: number) {
  return useQuery({
    queryKey: ['historical', playerId, years, round],
    queryFn: async () => {
      const results = await Promise.all(
        years.map(year =>
          supercoachApi.fetchPlayers(year, round).then(players =>
            players.find(p => p.feed_id === String(playerId)) ?? null
          )
        )
      );
      return results.filter(Boolean);
    },
    enabled: years.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
  });
}

export function useFilteredPlayers(
  players: Player[],
  weeklyPriceMap: Record<number, number> = {},
  fwBreakevenById: Record<number, number> = {},
  roundScoresById: Record<number, PlayerRoundScores> = {},
  roundScoresLoading = false,
  scoreRound = 0,
  byeMap: Record<string, number[]> = {},
) {
  const {
    positionFilter, sortBy, sortAscending, searchQuery,
    showOwnedOnly, showBubbleOnly, myTeamIds, priceMin, priceMax,
    byeRoundFilters,
  } = useAppStore();

  // Pure filter + sort lives in src/utils/playerFilterSort.ts so it's
  // unit-testable without rendering this hook. Pass everything the
  // helpers need explicitly — they don't touch the store directly.
  const filtered = applyPlayerFilters(players, {
    positionFilter, searchQuery, showOwnedOnly, showBubbleOnly,
    myTeamIds, priceMin, priceMax, byeRoundFilters, byeMap,
    sortBy, scoreRound, roundScoresById, roundScoresLoading,
  });

  return applyPlayerSort(filtered, {
    sortBy, sortAscending, weeklyPriceMap,
    fwBreakevenById, roundScoresById, scoreRound,
  });
}

/**
 * Per-player season summary fetched from the profile page (the only
 * Footywire endpoint that reliably year-filters). Use this for historical
 * mode in the player profile — the listing-page-based usePlayers can't
 * be trusted for past seasons because the listing pages silently return
 * current-year data when given ?year=2025.
 *
 * Returns the empty summary (games = 0, all stats = 0) if the player has
 * no rows for that year, which the profile screen should render as N/A.
 */
export function usePlayerHistoricalStats(player: Player | undefined, year: number) {
  return useQuery({
    queryKey: ['player-season-summary', 'v1', player?.id, year],
    queryFn: () => footywireApi.fetchPlayerSeasonSummary(
      player!.first_name, player!.last_name, player!.team.name, year,
    ),
    enabled: !!player,
    staleTime: 1000 * 60 * 60 * 24,
    placeholderData: (prev) => prev,
  });
}

export function usePlayerRoundBEs(player: Player | undefined, year: number, ppts: number) {
  return useQuery<Record<number, number>>({
    queryKey: ['player-round-bes', 'v1', player?.id, year, ppts],
    queryFn: () => footywireApi.fetchPlayerRoundBEs(
      player!.first_name, player!.last_name, player!.team.name, year, ppts,
    ),
    enabled: !!player,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours — backed by SQLite cache in fetchPlayerRoundBEs
    placeholderData: (prev) => prev,
  });
}

// ─── Fixture projections ──────────────────────────────────────────────────────

const HISTORICAL_YEARS = [2026, 2025, 2024];

export interface FixtureProjection {
  projScore: number;
  oppAvg: number; oppGames: number;
  venueAvg: number; venueGames: number;
}

export function useFixtureProjections(
  player: Player | undefined,
  fixtures: MatchEntry[],
  avg3: number,
  avg: number,
) {
  const queryClient = useQueryClient();
  const baseScore = avg > 0 ? avg : avg3;

  return useQuery<Record<number, FixtureProjection>>({
    queryKey: ['fixture-projections', 'v5', player?.id, CURRENT_YEAR, fixtures.map(f => f.round).join(',')],
    enabled: !!(player && fixtures.length > 0 && baseScore > 0),
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!player || fixtures.length === 0) return {};

      const cacheKey = `fx:${player.id}_${CURRENT_YEAR}_${fixtures.map(f => f.round).join('_')}`;

      try {
        const stored = await getJson<Record<number, FixtureProjection>>(cacheKey);
        if (stored) return stored;
      } catch { /* ignore */ }

      const [historicalMatchLists, historicalScores] = await Promise.all([
        Promise.all(
          HISTORICAL_YEARS.map(year =>
            queryClient.fetchQuery({
              queryKey: ['match-list', year],
              queryFn: () => footywireApi.fetchMatchList(year),
              staleTime: year < CURRENT_YEAR ? Infinity : 1000 * 60 * 60,
            }).catch(() => [] as MatchEntry[])
          )
        ),
        footywireApi.fetchPlayerHistoricalScores(
          player.first_name, player.last_name, player.team.name, HISTORICAL_YEARS,
        ),
      ]);

      const calcAvg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      const result: Record<number, FixtureProjection> = {};

      fixtures.forEach((fixture) => {
        const isHome   = fixture.homeTeam === player.team.name;
        const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
        const venue    = fixture.venue;

        const oppScores: number[] = [];
        const venueScores: number[] = [];

        HISTORICAL_YEARS.forEach((year, i) => {
          const matchList = historicalMatchLists[i];
          const scoreMap  = historicalScores[year] ?? new Map<number, number>();
          for (const match of matchList) {
            if (match.homeTeam !== player.team.name && match.awayTeam !== player.team.name) continue;
            const score = scoreMap.get(match.round);
            if (!score || score <= 0) continue;
            const matchIsHome = match.homeTeam === player.team.name;
            const matchOpp    = matchIsHome ? match.awayTeam : match.homeTeam;
            if (matchOpp === opponent) oppScores.push(score);
            if (match.venue === venue) venueScores.push(score);
          }
        });

        const oppAvg     = calcAvg(oppScores);
        const venueAvg   = calcAvg(venueScores);
        const oppGames   = oppScores.length;
        const venueGames = venueScores.length;

        // Context blend (used in component as modifier on rolling avg)
        const useOpp   = oppGames >= 2;
        const useVenue = venueGames >= 2;
        let projScore: number;
        if (useOpp && useVenue) projScore = baseScore * 0.5 + oppAvg * 0.3 + venueAvg * 0.2;
        else if (useOpp)        projScore = baseScore * 0.7 + oppAvg * 0.3;
        else if (useVenue)      projScore = baseScore * 0.8 + venueAvg * 0.2;
        else                    projScore = baseScore;

        result[fixture.round] = { projScore, oppAvg, oppGames, venueAvg, venueGames };
      });

      try {
        await setJson(cacheKey, result);
      } catch { /* ignore */ }

      return result;
    },
  });
}

// ─── Matchup stats ────────────────────────────────────────────────────────────

export interface MatchupStats {
  opponent: string;
  oppAbbrev: string;
  venue: string;
  oppAvg: number;
  venueAvg: number;
}

export function useMatchupStats(player: Player | undefined, nextMatch: MatchEntry | undefined) {
  const queryClient = useQueryClient();

  return useQuery<MatchupStats | null>({
    queryKey: ['matchup-stats', 'v3', player?.id, nextMatch?.round],
    enabled: !!(player && nextMatch),
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!player || !nextMatch) return null;

      const cacheKey = `mu:${player.id}_${nextMatch.round}_${CURRENT_YEAR}`;

      // 1. Check SQLite cache — survives app restarts, invalidated per player+round+year
      try {
        const stored = await getJson<MatchupStats>(cacheKey);
        if (stored) return stored;
      } catch { /* ignore */ }

      const isHome = nextMatch.homeTeam === player.team.name;
      const opponent = isHome ? nextMatch.awayTeam : nextMatch.homeTeam;
      const oppAbbrev = isHome ? nextMatch.awayAbbrev : nextMatch.homeAbbrev;
      const venue = nextMatch.venue;

      // 2. Fetch match lists via queryClient (pre-cached from index screen) + pu- page
      const [historicalMatchLists, historicalScores] = await Promise.all([
        Promise.all(
          HISTORICAL_YEARS.map(year =>
            queryClient.fetchQuery({
              queryKey: ['match-list', year],
              queryFn: () => footywireApi.fetchMatchList(year),
              staleTime: year < CURRENT_YEAR ? Infinity : 1000 * 60 * 60,
            }).catch(() => [] as MatchEntry[])
          )
        ),
        footywireApi.fetchPlayerHistoricalScores(
          player.first_name,
          player.last_name,
          player.team.name,
          HISTORICAL_YEARS,
        ),
      ]);

      const oppScores: number[] = [];
      const venueScores: number[] = [];

      HISTORICAL_YEARS.forEach((year, i) => {
        const matchList = historicalMatchLists[i];
        const scoreMap = historicalScores[year] ?? new Map<number, number>();
        const teamMatches = matchList.filter(
          m => m.homeTeam === player.team.name || m.awayTeam === player.team.name
        );
        for (const match of teamMatches) {
          const score = scoreMap.get(match.round);
          if (!score || score <= 0) continue;
          const matchIsHome = match.homeTeam === player.team.name;
          const matchOpp = matchIsHome ? match.awayTeam : match.homeTeam;
          if (matchOpp === opponent) oppScores.push(score);
          if (match.venue === venue) venueScores.push(score);
        }
      });

      const calcAvg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      const result: MatchupStats = {
        opponent, oppAbbrev, venue,
        oppAvg: calcAvg(oppScores),
        venueAvg: calcAvg(venueScores),
      };

      // 3. Persist to SQLite for instant cold-start next time. The aggregate
      //    is built entirely from HISTORICAL_YEARS data (prior seasons), so
      //    within a given CURRENT_YEAR the result is frozen — mark the row
      //    permanent. When the season rolls over, CURRENT_YEAR changes and
      //    the cache key changes with it, so the new key fetches fresh and
      //    the old key (now stale) ages out via deleteByPrefix on cleanup.
      try {
        await setJson(cacheKey, result, { permanent: true });
      } catch { /* ignore */ }

      return result;
    },
  });
}
