import { useQuery } from '@tanstack/react-query';
import { supercoachApi } from '../api/supercoach';
import { squiggleApi } from '../api/squiggle';
import { footywireApi, PlayerRoundScores, MatchEntry } from '../api/footywire';
import { Player, PositionFilter, SortOption } from '../types';
import { useAppStore } from '../store/useAppStore';

export { PlayerRoundScores };

export function usePlayers(year: number, round: number) {
  return useQuery({
    queryKey: ['players', 'v11', year, round],
    queryFn: () => supercoachApi.fetchPlayers(year, round),
    staleTime: 1000 * 60 * 30, // 30 min cache
  });
}

export function useMatchList(year: number) {
  return useQuery({
    queryKey: ['match-list', year],
    queryFn: () => footywireApi.fetchMatchList(year),
    staleTime: 1000 * 60 * 60, // 1 hour — fixture list rarely changes mid-session
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
) {
  const { positionFilter, sortBy, sortAscending, searchQuery, showOwnedOnly, myTeamIds } = useAppStore();

  let filtered = players;

  if (showOwnedOnly && myTeamIds.length > 0) {
    filtered = filtered.filter(p => myTeamIds.includes(p.id));
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

  // Only filter by score data once the background query has finished loading.
  // While loading, show all players so the list is never empty.
  if (!roundScoresLoading) {
    if (sortBy === 'avg3') {
      filtered = filtered.filter(p => (p.player_stats?.[0]?.avg3 ?? 0) > 0);
    } else if (sortBy === 'avg5') {
      filtered = filtered.filter(p => (roundScoresById[p.id]?.avg5 ?? 0) > 0);
    } else if (sortBy === 'points') {
      filtered = filtered.filter(p => (roundScoresById[p.id]?.lastScore ?? 0) > 0);
    }
  } else if (sortBy === 'avg3') {
    // L3 comes from the bulk page — always available immediately
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
        const aScore = roundScoresById[a.id]?.lastScore ?? 0;
        const bScore = roundScoresById[b.id]?.lastScore ?? 0;
        diff = bScore - aScore;
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

// ─── Matchup stats ────────────────────────────────────────────────────────────

const HISTORICAL_YEARS = [2026, 2025, 2024];

export interface MatchupStats {
  opponent: string;
  oppAbbrev: string;
  venue: string;
  oppAvg: number;
  venueAvg: number;
}

export function useMatchupStats(player: Player | undefined, nextMatch: MatchEntry | undefined) {
  return useQuery<MatchupStats | null>({
    queryKey: ['matchup-stats', 'v3', player?.id, nextMatch?.round],
    enabled: !!(player && nextMatch),
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!player || !nextMatch) return null;

      const isHome = nextMatch.homeTeam === player.team.name;
      const opponent = isHome ? nextMatch.awayTeam : nextMatch.homeTeam;
      const oppAbbrev = isHome ? nextMatch.awayAbbrev : nextMatch.homeAbbrev;
      const venue = nextMatch.venue;

      console.log(`[Matchup] player="${player.first_name} ${player.last_name}" team="${player.team.name}" opp="${opponent}" venue="${venue}"`);

      const [historicalMatchLists, historicalScores] = await Promise.all([
        Promise.all(
          HISTORICAL_YEARS.map(year =>
            footywireApi.fetchMatchList(year).catch(() => [] as MatchEntry[])
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

        console.log(`[Matchup] year=${year} teamMatches=${teamMatches.length} scoreMapSize=${scoreMap.size}`);

        for (const match of teamMatches) {
          const score = scoreMap.get(match.round);
          if (!score || score <= 0) continue;
          const matchIsHome = match.homeTeam === player.team.name;
          const matchOpp = matchIsHome ? match.awayTeam : match.homeTeam;
          console.log(`[Matchup] year=${year} rnd=${match.round} vs=${matchOpp} @${match.venue} sc=${score}`);
          if (matchOpp === opponent) oppScores.push(score);
          if (match.venue === venue) venueScores.push(score);
        }
      });

      console.log(`[Matchup] oppScores=${JSON.stringify(oppScores)} venueScores=${JSON.stringify(venueScores)}`);

      const calcAvg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      return { opponent, oppAbbrev, venue, oppAvg: calcAvg(oppScores), venueAvg: calcAvg(venueScores) };
    },
  });
}
