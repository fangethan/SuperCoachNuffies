import { SC_DOLLARS_PER_POINT, SC_STARTING_BE_DIVISOR } from '../constants';

/**
 * One row of price/score history for a player, as parsed from Footywire's
 * profile-page table. Null score means the row exists (price valid) but the
 * player didn't play that round (DNP, bye, or the upcoming live round).
 */
export interface RoundDataRow {
  round: number;
  price: number;
  score: number | null;
}

/**
 * Pure BE-derivation core. Given a player's round-by-round price + score
 * history (already filtered to a single season) and Footywire's published
 * "currentBE" (the forward-looking BE for the next unplayed round), return
 * a `{ round → BE }` map covering every scored round plus the upcoming one.
 *
 * Why split this out: the whole derivation can be tested with a synthetic
 * `roundData` array, no HTML parsing or network. The wrapping fetch
 * function in `src/api/footywire.ts` calls this after parsing the page.
 *
 * Formula picked per round:
 *   - 1st scored round (firstScoredIdx) → SC starting-BE convention
 *       BE = round(price / 5000)
 *     (price is frozen on a player's 1st played game per the bubble rule)
 *   - 2nd scored round (secondScoredIdx) → bubble formula with proj_avg
 *     filling in the missing R-2 round:
 *       BE = round(2·proj_avg − score_of_first_scored)
 *   - Every subsequent round → priceChange formula
 *       BE = round(score − priceChange × 9 / SC_MAGIC)
 *     where priceChange is `next_row.price − this_row.price`.
 *   - Last scored round only writes a BE if the next price row exists
 *     (Footywire usually publishes that on Tuesday post-round). Otherwise
 *     it stays absent until the next refetch.
 *
 * Edge cases handled:
 *   - DNP rows (score === null) are skipped for derivation but still
 *     contribute their price to the priceChange of the surrounding rounds.
 *   - currentBE is stored under `lastScoredRound + 1` so the chart can
 *     show the upcoming round's BE.
 */
export function deriveBEMap(
  roundData: RoundDataRow[],
  currentBE: number,
): Record<number, number> {
  // Indices of the first two scored rows + the last scored row.
  let firstScoredIdx = -1;
  let secondScoredIdx = -1;
  let lastScoredIdx = -1;
  for (let i = 0; i < roundData.length; i++) {
    if (roundData[i].score === null) continue;
    if (firstScoredIdx < 0) firstScoredIdx = i;
    else if (secondScoredIdx < 0) { secondScoredIdx = i; break; }
  }
  for (let i = roundData.length - 1; i >= 0; i--) {
    if (roundData[i].score !== null) { lastScoredIdx = i; break; }
  }

  const result: Record<number, number> = {};
  for (let i = 0; i < roundData.length; i++) {
    const curr = roundData[i];
    if (curr.score === null) continue;

    if (i === firstScoredIdx) {
      result[curr.round] = Math.round(curr.price / SC_STARTING_BE_DIVISOR);
    } else if (i === secondScoredIdx) {
      const projAvg = roundData[firstScoredIdx].price / SC_STARTING_BE_DIVISOR;
      const sFirst = roundData[firstScoredIdx].score ?? 0;
      result[curr.round] = Math.round(2 * projAvg - sFirst);
    } else if (i === lastScoredIdx) {
      if (i + 1 < roundData.length) {
        const priceChange = roundData[i + 1].price - curr.price;
        result[curr.round] = Math.round(curr.score - (priceChange / SC_DOLLARS_PER_POINT));
      }
    } else {
      const priceChange = roundData[i + 1].price - curr.price;
      result[curr.round] = Math.round(curr.score - (priceChange / SC_DOLLARS_PER_POINT));
    }
  }

  if (lastScoredIdx >= 0 && currentBE !== 0) {
    result[roundData[lastScoredIdx].round + 1] = currentBE;
  }

  return result;
}

/**
 * Splits a derived BE map into a frozen half and a live half, mirroring
 * the SQLite be8p:/be8: namespace split. Past seasons return all entries
 * in the frozen half.
 *
 * The "live" round is the one carrying Footywire's currentBE — i.e.
 * `lastScoredRound + 1`. That entry can shift daily as Footywire updates
 * its projection, so it stays on the cache TTL. Everything else is locked.
 */
export function splitBEMap(
  beMap: Record<number, number>,
  roundData: RoundDataRow[],
  isCurrentYear: boolean,
): { frozen: Record<number, number>; live: Record<number, number> } {
  let lastScoredIdx = -1;
  for (let i = roundData.length - 1; i >= 0; i--) {
    if (roundData[i].score !== null) { lastScoredIdx = i; break; }
  }
  const liveRound = lastScoredIdx >= 0 ? roundData[lastScoredIdx].round + 1 : -1;

  const frozen: Record<number, number> = {};
  const live: Record<number, number> = {};
  for (const [k, be] of Object.entries(beMap)) {
    const round = parseInt(k, 10);
    if (isCurrentYear && round === liveRound) live[round] = be;
    else frozen[round] = be;
  }
  return { frozen, live };
}
