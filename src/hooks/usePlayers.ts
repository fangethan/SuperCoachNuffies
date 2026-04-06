import { useQuery } from '@tanstack/react-query';
import { supercoachApi } from '../api/supercoach';
import { squiggleApi } from '../api/squiggle';
import { Player, PositionFilter, SortOption } from '../types';
import { useAppStore } from '../store/useAppStore';

export function usePlayers(year: number, round: number) {
  return useQuery({
    queryKey: ['players', year, round],
    queryFn: () => supercoachApi.fetchPlayers(year, round),
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

export function useFilteredPlayers(players: Player[]) {
  const { positionFilter, sortBy, searchQuery } = useAppStore();

  let filtered = players;

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
    switch (sortBy) {
      case 'avg':    return (sb.avg ?? 0) - (sa.avg ?? 0);
      case 'avg3':   return (sb.avg3 ?? 0) - (sa.avg3 ?? 0);
      case 'avg5':   return (sb.avg5 ?? 0) - (sa.avg5 ?? 0);
      case 'price':  return (sb.price ?? 0) - (sa.price ?? 0);
      case 'price_change': return (sb.price_change ?? 0) - (sa.price_change ?? 0);
      case 'points': return (sb.points ?? 0) - (sa.points ?? 0);
      case 'owned':  return (sb.owned ?? 0) - (sa.owned ?? 0);
      case 'ppts':   return (sa.ppts ?? 0) - (sb.ppts ?? 0); // low BE = good
      default:       return 0;
    }
  });

  return filtered;
}
