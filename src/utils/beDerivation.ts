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
  /**
   * The round Footywire's published currentBE applies to. Defaults to
   * `lastScored + 1` (the historical assumption). Pass the live
   * `maxRound` from the store when calling so the chart attributes
   * the BE to the round it's actually for — when R9 has just been
   * played but R9 isn't fully closed yet, currentBE still represents
   * R9's BE, not R10's. Without this, the dot landed at R10 and the
   * R9 dot fell back to the previous round's value.
   */
  liveRound?: number,
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

  if (currentBE !== 0) {
    // currentBE applies to the live round (the round Footywire's BE
    // page is currently published for). Default to lastScored+1 if
    // liveRound wasn't passed (back-compat with older callers and
    // tests). When R9 has played but R9 isn't fully closed yet, the
    // caller's maxRound is still 9, and currentBE is the BE Jackson
    // *just played against* — pin it to R9, not R10.
    const beRound = liveRound ?? (lastScoredIdx >= 0 ? roundData[lastScoredIdx].round + 1 : -1);
    if (beRound > 0) {
      result[beRound] = currentBE;
    }

    // Project the round AFTER the live round using Scobey's empirical
    // BE formula (verified against his Xerri/McLuggage/Durham
    // walkthroughs). This is what fills the chart's dot for next
    // round when Footywire hasn't published it yet.
    //
    //   K        = currentBE + S_{R-1} + S_{R-2}
    //   BE_{R+1} = K − S_R − S_{R-1}
    //
    // Only fires when liveRound matches the player's lastScoredRound
    // (i.e., they've just played and we have S_R available).
    if (
      liveRound !== undefined &&
      lastScoredIdx >= 0 &&
      roundData[lastScoredIdx].round === liveRound
    ) {
      const playedRows = roundData
        .filter(r => r.score !== null)
        .sort((a, b) => a.round - b.round);
      const len = playedRows.length;
      if (len >= 3) {
        const sR       = playedRows[len - 1].score ?? 0;
        const sR_m1    = playedRows[len - 2].score ?? 0;
        const sR_m2    = playedRows[len - 3].score ?? 0;
        const K        = currentBE + sR_m1 + sR_m2;
        result[liveRound + 1] = Math.round(K - sR - sR_m1);
      }
    }
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
/**
 * Aggregate season-level stats derived from the per-player profile page
 * (which supports a year selector that the listing pages do not). Used
 * for the historical-mode player profile to back-fill avg / 3rd / 5rd /
 * price / weekly + season change directly from the player's actual
 * round-by-round history for that year, rather than the listing-page
 * snapshot which silently returns current-year data.
 */
export interface PlayerSeasonSummary {
  games: number;            // count of played rounds (score !== null)
  totalPoints: number;
  avg: number;              // 0 if games === 0
  avg3: number;             // avg of last 3 played rounds (0 if <3)
  avg5: number;
  lastScore: number;        // most recent played round's score
  lastRound: number;        // round number of the last row in the table
  lastPrice: number;        // price at the last row in the table
  startingPrice: number;    // first row's price (typically the rookie floor)
  weeklyChange: number;     // change between the last two rows
  totalChange: number;      // lastPrice − startingPrice
}

export function emptySeasonSummary(): PlayerSeasonSummary {
  return {
    games: 0, totalPoints: 0, avg: 0, avg3: 0, avg5: 0,
    lastScore: 0, lastRound: 0, lastPrice: 0, startingPrice: 0,
    weeklyChange: 0, totalChange: 0,
  };
}

export function computeSeasonSummary(roundData: RoundDataRow[]): PlayerSeasonSummary {
  if (roundData.length === 0) return emptySeasonSummary();

  const playedRows = roundData.filter(r => r.score !== null);
  const games = playedRows.length;
  const totalPoints = playedRows.reduce((s, r) => s + (r.score ?? 0), 0);

  const avgOfLast = (n: number) => {
    const last = playedRows.slice(-n);
    if (last.length === 0) return 0;
    return last.reduce((s, r) => s + (r.score ?? 0), 0) / last.length;
  };

  const lastPlayed = playedRows[playedRows.length - 1];
  const firstRow   = roundData[0];
  const lastRow    = roundData[roundData.length - 1];

  return {
    games,
    totalPoints,
    avg:           games > 0 ? totalPoints / games : 0,
    avg3:          avgOfLast(3),
    avg5:          avgOfLast(5),
    lastScore:     lastPlayed?.score ?? 0,
    lastRound:     lastRow.round,
    lastPrice:     lastRow.price,
    startingPrice: firstRow.price,
    weeklyChange:  roundData.length >= 2
      ? lastRow.price - roundData[roundData.length - 2].price
      : 0,
    totalChange:   lastRow.price - firstRow.price,
  };
}

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
