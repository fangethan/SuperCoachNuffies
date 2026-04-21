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

// Returns a map of teamName -> all bye round numbers for the year
async function fetchByeRounds(year: number): Promise<Record<string, number[]>> {
  const allGames = await fetchFixture(year);
  const regularGames = allGames.filter(g => g.round >= 1 && g.round <= 23 && !g.is_final);

  const teamRounds: Record<string, Set<number>> = {};
  regularGames.forEach(game => {
    if (!teamRounds[game.hteam]) teamRounds[game.hteam] = new Set();
    if (!teamRounds[game.ateam]) teamRounds[game.ateam] = new Set();
    teamRounds[game.hteam].add(game.round);
    teamRounds[game.ateam].add(game.round);
  });

  const allRounds = Array.from(new Set(regularGames.map(g => g.round))).sort((a, b) => a - b);
  const byeMap: Record<string, number[]> = {};
  Object.entries(teamRounds).forEach(([team, rounds]) => {
    byeMap[team] = allRounds.filter(r => !rounds.has(r));
  });

  return byeMap;
}

export const squiggleApi = {
  fetchFixture,
  fetchRound,
  fetchByeRounds,
};
