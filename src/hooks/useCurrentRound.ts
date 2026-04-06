import { useQuery } from '@tanstack/react-query';
import { squiggleApi } from '../api/squiggle';
import { CURRENT_YEAR } from '../constants';

// Determines the current active round from the fixture
// Logic: find the latest round that has at least one completed game
// If all games in a round are complete, we move to the next round
export function useCurrentRound(year: number = CURRENT_YEAR) {
  return useQuery({
    queryKey: ['currentRound', year],
    queryFn: async () => {
      const games = await squiggleApi.fetchFixture(year);
      const regularGames = games.filter(g => !g.is_final && g.round <= 23);

      // Group by round
      const byRound: Record<number, typeof regularGames> = {};
      regularGames.forEach(g => {
        if (!byRound[g.round]) byRound[g.round] = [];
        byRound[g.round].push(g);
      });

      const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

      let currentRound = rounds[0] ?? 1;

      for (const round of rounds) {
        const roundGames = byRound[round];
        const hasStarted = roundGames.some(g => g.complete > 0);
        const allComplete = roundGames.every(g => g.complete === 100);

        if (hasStarted) {
          currentRound = round;
          // If this round is fully done, point to the next round
          if (allComplete && round < Math.max(...rounds)) {
            currentRound = round + 1;
          }
        } else {
          // First round with no games started = upcoming round
          break;
        }
      }

      return currentRound;
    },
    staleTime: 1000 * 60 * 15, // re-check every 15 minutes
    refetchInterval: 1000 * 60 * 15,
  });
}
