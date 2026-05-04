import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supercoachApi } from '../api/supercoach';
import { squiggleApi } from '../api/squiggle';
import { footywireApi, PlayerRoundScores, MatchEntry } from '../api/footywire';
import { Player, PositionFilter, SortOption } from '../types';
import { useAppStore } from '../store/useAppStore';
import { CURRENT_YEAR } from '../constants';
import { getJson, setJson } from '../store/cache';

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
  const { positionFilter, sortBy, sortAscending, searchQuery, showOwnedOnly, showBubbleOnly, myTeamIds, priceMin, priceMax, byeRoundFilters } = useAppStore();

  const getRoundScore = (id: number) =>
    scoreRound > 0
      ? (roundScoresById[id]?.roundScores?.[scoreRound] ?? 0)
      : (roundScoresById[id]?.lastScore ?? 0);

  let filtered = players;

  if (showOwnedOnly && myTeamIds.length > 0) {
    filtered = filtered.filter(p => myTeamIds.includes(p.id));
  }

  if (showBubbleOnly) {
    filtered = filtered.filter(p => (p.player_stats?.[0]?.games ?? 0) <= 2);
  }

  // Price range — values in $k (floats); player prices are in dollars
  if (priceMin > 95.0 || priceMax < 750.0) {
    filtered = filtered.filter(p => {
      const priceK = (p.player_stats?.[0]?.price ?? 0) / 1000;
      const passMin = priceMin <= 95.0  || priceK >= priceMin;
      const passMax = priceMax >= 750.0 || priceK <= priceMax;
      return passMin && passMax;
    });
  }

  // Bye round — filter OUT players whose team is on bye in any selected round
  if (byeRoundFilters.length > 0 && Object.keys(byeMap).length > 0) {
    filtered = filtered.filter(p => {
      const teamByes = byeMap[p.team?.name ?? ''] ?? [];
      return !byeRoundFilters.some(r => teamByes.includes(r));
    });
  }

  if (positionFilter !== 'ALL') {
    filtered = filtered.filter(p =>
      p.positions?.some(pos => pos.position === positionFilter)
    );
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      p.team.name.toLowerCase().includes(q)
    );
  }

  if (!roundScoresLoading) {
    if (sortBy === 'avg3') {
      filtered = filtered.filter(p => (p.player_stats?.[0]?.avg3 ?? 0) > 0);
    } else if (sortBy === 'avg5') {
      filtered = filtered.filter(p => (roundScoresById[p.id]?.avg5 ?? 0) > 0);
    } else if (sortBy === 'points') {
      filtered = filtered.filter(p => getRoundScore(p.id) > 0);
    }
  } else if (sortBy === 'avg3') {
    filtered = filtered.filter(p => (p.player_stats?.[0]?.avg3 ?? 0) > 0);
  }

  filtered = [...filtered].sort((a, b) => {
    const sa = a.player_stats?.[0];
    const sb = b.player_stats?.[0];
    if (!sa || !sb) return 0;
    let diff = 0;
    switch (sortBy) {
      case 'avg':    diff = (sb.avg ?? 0) - (sa.avg ?? 0); break;
      case 'avg3':   diff = (sb.avg3 ?? 0) - (sa.avg3 ?? 0); break;
      case 'avg5': {
        const a5 = roundScoresById[a.id]?.avg5 ?? 0;
        const b5 = roundScoresById[b.id]?.avg5 ?? 0;
        diff = b5 - a5;
        break;
      }
      case 'price':  diff = (sb.price ?? 0) - (sa.price ?? 0); break;
      case 'price_change': {
        const aChange = weeklyPriceMap[a.id] ?? sa.price_change ?? 0;
        const bChange = weeklyPriceMap[b.id] ?? sb.price_change ?? 0;
        diff = bChange - aChange;
        break;
      }
      case 'points': {
        diff = getRoundScore(b.id) - getRoundScore(a.id);
        break;
      }
      case 'total_pts': {
        diff = (sb.total_points ?? 0) - (sa.total_points ?? 0);
        break;
      }
      case 'owned':  diff = (sb.owned ?? 0) - (sa.owned ?? 0); break;
      case 'ppts': {
        const abe = fwBreakevenById[a.id] ?? sa.ppts ?? null;
        const bbe = fwBreakevenById[b.id] ?? sb.ppts ?? null;
        if (abe === null && bbe === null) { diff = 0; break; }
        if (abe === null) { diff = 1; break; }
        if (bbe === null) { diff = -1; break; }
        diff = bbe - abe;
        break;
      }
      default: diff = 0;
    }
    return sortAscending ? -diff : diff;
  });

  return filtered;
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
