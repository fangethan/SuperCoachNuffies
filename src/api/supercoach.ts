import { Player } from '../types';

const BASE_URL = 'https://www.supercoach.com.au';

async function fetchPlayers(year: number, round: number): Promise<Player[]> {
  const url = `${BASE_URL}/${year}/api/afl/classic/v1/players-cf?embed=notes,odds,player_stats,positions&round=${round}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SuperCoach API error: ${res.status}`);
  return res.json();
}

// Fetch all rounds for a given year (for historical analysis)
async function fetchAllRoundsForYear(year: number, totalRounds: number): Promise<Player[][]> {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);
  const results = await Promise.all(rounds.map(r => fetchPlayers(year, r).catch(() => [])));
  return results;
}

export const supercoachApi = {
  fetchPlayers,
  fetchAllRoundsForYear,
};
