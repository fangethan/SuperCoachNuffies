import { useQuery } from '@tanstack/react-query';
import { supercoachApi } from '../api/supercoach';
import { squiggleApi } from '../api/squiggle';
import { footywireApi } from '../api/footywire';
import { Player, PositionFilter, SortOption } from '../types';
import { useAppStore } from '../store/useAppStore';

export function usePlayers(year: number, round: number) {
  return useQuery({
    queryKey: ['players', year, round],
    queryFn: () => supercoachApi.fetchPlayers(year, round),
    staleTime: 1000 * 60 * 30, // 30 min cache
  });
}

export function useFootywireBreakevens() {
  return useQuery({
    queryKey: ['footywire', 'breakevens', 'v10'],
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

  filtered = [...filtered].sort((a, b) => {
    const sa = a.player_stats?.[0];
    const sb = b.player_stats?.[0];
    if (!sa || !sb) return 0;
    let diff = 0;
    switch (sortBy) {
      case 'avg':    diff = (sb.avg ?? 0) - (sa.avg ?? 0); break;
      case 'avg3':   diff = (sb.avg3 ?? 0) - (sa.avg3 ?? 0); break;
      case 'avg5':   diff = (sb.avg5 ?? 0) - (sa.avg5 ?? 0); break;
      case 'price':  diff = (sb.price ?? 0) - (sa.price ?? 0); break;
      case 'price_change': {
        // Use previous round's price_change (most recently calculated weekly change)
        const aChange = weeklyPriceMap[a.id] ?? sa.price_change ?? 0;
        const bChange = weeklyPriceMap[b.id] ?? sb.price_change ?? 0;
        diff = bChange - aChange;
        break;
      }
      case 'points': {
        const d = (sb.points ?? 0) - (sa.points ?? 0);
        diff = d !== 0 ? d : (sb.total_points ?? 0) - (sa.total_points ?? 0);
        break;
      }
      case 'owned':  diff = (sb.owned ?? 0) - (sa.owned ?? 0); break;
      case 'ppts': {
        const abe = fwBreakevenById[a.id] ?? sa.ppts ?? null;
        const bbe = fwBreakevenById[b.id] ?? sb.ppts ?? null;
        if (abe === null && bbe === null) { diff = 0; break; }
        if (abe === null) { diff = 1; break; }  // push nulls to bottom
        if (bbe === null) { diff = -1; break; }
        diff = bbe - abe; // high BE first by default
        break;
      }
      default: diff = 0;
    }
    return sortAscending ? -diff : diff;
  });

  return filtered;
}
