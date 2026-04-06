import { SquiggleMatch } from '../types';

const BASE_URL = 'https://api.squiggle.com.au';

interface SquiggleResponse {
  games: SquiggleMatch[];
}

async function fetchFixture(year: number): Promise<SquiggleMatch[]> {
  const res = await fetch(`${BASE_URL}/?q=games;year=${year}`, {
    headers: { 'User-Agent': 'SuperCoachNuffies/1.0' },
  });
  if (!res.ok) throw new Error(`Squiggle API error: ${res.status}`);
  const data: SquiggleResponse = await res.json();
  return data.games;
}

async function fetchRound(year: number, round: number): Promise<SquiggleMatch[]> {
  const res = await fetch(`${BASE_URL}/?q=games;year=${year};round=${round}`, {
    headers: { 'User-Agent': 'SuperCoachNuffies/1.0' },
  });
  if (!res.ok) throw new Error(`Squiggle API error: ${res.status}`);
  const data: SquiggleResponse = await res.json();
  return data.games;
}

// Returns a map of teamName -> bye round number for the year
async function fetchByeRounds(year: number): Promise<Record<string, number>> {
  const allGames = await fetchFixture(year);
  // Regular season only (rounds 1-23, no finals)
  const regularGames = allGames.filter(g => g.round <= 23 && !g.is_final);

  // Build set of rounds each team played in
  const teamRounds: Record<string, Set<number>> = {};
  regularGames.forEach(game => {
    if (!teamRounds[game.hteam]) teamRounds[game.hteam] = new Set();
    if (!teamRounds[game.ateam]) teamRounds[game.ateam] = new Set();
    teamRounds[game.hteam].add(game.round);
    teamRounds[game.ateam].add(game.round);
  });

  // Find the round each team is missing (their bye)
  const byeMap: Record<string, number> = {};
  const allRounds = new Set(regularGames.map(g => g.round));
  Object.entries(teamRounds).forEach(([team, rounds]) => {
    for (const r of allRounds) {
      if (!rounds.has(r)) {
        byeMap[team] = r;
        break;
      }
    }
  });

  return byeMap;
}

export const squiggleApi = {
  fetchFixture,
  fetchRound,
  fetchByeRounds,
};
