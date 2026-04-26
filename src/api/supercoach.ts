import { Player } from '../types';
import { footywireApi } from './footywire';

// All player data now sourced from Footywire.
// This module is kept as a thin wrapper so call-sites don't need to change.
async function fetchPlayers(year: number, round: number): Promise<Player[]> {
  return footywireApi.fetchAllPlayers(year, round);
}

export const supercoachApi = { fetchPlayers };
