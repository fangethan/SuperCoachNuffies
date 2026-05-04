import { deriveBEMap, splitBEMap, RoundDataRow } from './beDerivation';
import { SC_DOLLARS_PER_POINT, SC_STARTING_BE_DIVISOR } from '../constants';

/** Convenience: build a round row. */
const r = (round: number, price: number, score: number | null): RoundDataRow =>
  ({ round, price, score });

describe('deriveBEMap — starting BE (firstScoredIdx)', () => {
  test('first scored round uses price / 5000', () => {
    // Single played round at the floor price ($99.1k). Starting BE
    // convention is round(price / 5000) = round(19.82) = 20. Same as
    // the published Footywire BE for unplayed $99.1k players.
    const data = [r(1, 99100, 70)];
    expect(deriveBEMap(data, 0)[1]).toBe(20);
  });

  test('two same-priced rookies get the same R1 BE regardless of score', () => {
    // The "Blamires vs Watkins" regression. Both started at $99.1k. The
    // formula must depend on price only (not the score), so the R1 BE
    // is identical even though the scores differ.
    const blamires = deriveBEMap([r(1, 99100, 70)], 0);
    const watkins  = deriveBEMap([r(1, 99100, 45)], 0);
    expect(blamires[1]).toBe(watkins[1]);
  });

  test('premium player starting BE matches price / 5000', () => {
    // Bontempelli at $700k → starting BE = 140. Verified against the
    // published BE of 140 for round 0 in the Footywire data.
    const data = [r(0, 700_000, 117)];
    expect(deriveBEMap(data, 0)[0]).toBe(140);
  });
});

describe('deriveBEMap — bubble formula (secondScoredIdx)', () => {
  test('R1 BE = 2·proj − S_R0 when both rounds frozen', () => {
    // Grundy: $674,200 starting price (proj_avg ≈ 134.84), R0 score 117.
    // Both R0 and R1 have $0 priceChange (bubble rule), so BE_R1 from
    // priceChange would collapse to score=89 (his R1 score), which is wrong.
    // Bubble formula: 2·134.84 − 117 = 152.68 → 153.
    const data = [
      r(0, 674_200, 117),
      r(1, 674_200, 89),
    ];
    const map = deriveBEMap(data, 0);
    expect(map[0]).toBe(135);                  // proj_avg
    expect(map[1]).toBe(153);                  // 2·135 − 117
  });

  test('Liam Henry: 1 game played, currentBE = next round BE', () => {
    // proj_avg 32 from $160,000 starting price. He scored 88 in his
    // first played round (R8). Footywire publishes next-round BE as
    // currentBE — we expect to see it under R9.
    const data = [r(8, 160_000, 88)];
    const map = deriveBEMap(data, -22);
    expect(map[8]).toBe(32);                   // starting BE = proj_avg
    expect(map[9]).toBe(-22);                  // currentBE under upcoming round
  });

  test('R1 score does not affect R0 BE', () => {
    // Sanity: R0 BE depends only on R0 price. Vary R1 score, R0 BE must
    // not move.
    const a = deriveBEMap([r(0, 500_000, 80), r(1, 500_000, 100)], 0);
    const b = deriveBEMap([r(0, 500_000, 80), r(1, 500_000, 50)], 0);
    expect(a[0]).toBe(b[0]);
    expect(a[0]).toBe(100);  // 500000 / 5000
  });

  test('bubble works across a DNP between first and second scored rounds', () => {
    // Player plays R1, sits out R2, plays R3. firstScoredIdx = R1,
    // secondScoredIdx = R3. The bubble formula must still use R1's score
    // to compute R3's BE since R3 is the player's 2nd played game.
    const data = [
      r(1, 200_000, 60),
      r(2, 200_000, null),                     // DNP
      r(3, 200_000, 80),                       // 2nd played, still frozen
    ];
    const map = deriveBEMap(data, 0);
    expect(map[1]).toBe(40);                   // proj_avg
    expect(map[3]).toBe(2 * 40 - 60);          // 2·proj − S_first = 20
    expect(map).not.toHaveProperty('2');       // DNP row gets no BE
  });
});

describe('deriveBEMap — post-bubble priceChange formula', () => {
  test('mid-history round derives BE from priceChange', () => {
    // BE = score − priceChange × 9 / SC_MAGIC.
    // Grundy R3 score 145, R3 price $674,200, R4 price $649,800.
    // priceChange = -$24,400. BE_R3 = 145 − (-24400 / 453.X) ≈ 199.
    const data = [
      r(0, 674_200, 117),
      r(1, 674_200, 89),
      r(2, 674_200, 145),
      r(3, 649_800, 70),                       // R4 in 2026 is index 3 here
    ];
    const map = deriveBEMap(data, 0);
    // Hand-compute R2 BE: 145 - (-24400 / SC_DOLLARS_PER_POINT).
    const expected = Math.round(145 - (-24400 / SC_DOLLARS_PER_POINT));
    expect(map[2]).toBe(expected);
  });

  test('priceChange formula gives same BE for same gap regardless of starting price', () => {
    // Two players, identical R3 score (100) and identical priceChange (+$50k
    // going into R4), but very different starting prices. The priceChange
    // formula is flat $/point — does NOT scale with player price — so BE_R3
    // must match. (The old (price/1287) heuristic violated this and broke
    // cheap-player predictions; this test prevents that regression.)
    const cheap = [
      r(1, 200_000, 60),
      r(2, 200_000, 80),
      r(3, 200_000, 100),
      r(4, 250_000, null),                     // priceChange +$50k during R3
    ];
    const expensive = [
      r(1, 800_000, 60),
      r(2, 800_000, 80),
      r(3, 800_000, 100),
      r(4, 850_000, null),                     // same priceChange, different price
    ];

    expect(deriveBEMap(cheap, 0)[3]).toBe(deriveBEMap(expensive, 0)[3]);
  });

  test('DNP between two played rounds still gives a valid priceChange', () => {
    // Player plays R3, sits R4 (bye), plays R5. R4 still has a price row
    // (= entry price for R5). BE_R3 must use the R4 price.
    const data = [
      r(1, 500_000, 80),
      r(2, 500_000, 90),
      r(3, 500_000, 100),                      // 3rd played → derive from R4 price
      r(4, 480_000, null),                     // bye row, price still tracked
      r(5, 480_000, 75),
    ];
    const map = deriveBEMap(data, 0);
    // priceChange at R3 = $480k - $500k = -$20k
    const expected = Math.round(100 - (-20000 / SC_DOLLARS_PER_POINT));
    expect(map[3]).toBe(expected);
  });
});

describe('deriveBEMap — last scored round', () => {
  test('writes BE only when the next price row exists', () => {
    // Player has played R1-R3. Footywire has not yet published R4's price.
    // The lastScoredIdx (R3) cannot derive a BE — leave it absent rather
    // than writing a wrong value. currentBE goes under R4.
    const data = [
      r(1, 200_000, 60),
      r(2, 200_000, 80),
      r(3, 200_000, 100),                      // last in array, no R4 row
    ];
    const map = deriveBEMap(data, 50);
    expect(map).not.toHaveProperty('3');       // unable to derive
    expect(map[4]).toBe(50);                   // currentBE goes under R4
  });

  test('writes BE when next price row is present', () => {
    const data = [
      r(1, 200_000, 60),
      r(2, 200_000, 80),
      r(3, 200_000, 100),
      r(4, 220_000, null),                     // upcoming row published
    ];
    const map = deriveBEMap(data, 0);
    const expected = Math.round(100 - (20000 / SC_DOLLARS_PER_POINT));
    expect(map[3]).toBe(expected);
  });
});

describe('deriveBEMap — currentBE handling', () => {
  test('currentBE = 0 (player out for season) is not written', () => {
    // Footywire publishes currentBE = 0 for inactive players. We don't
    // want a phantom BE dot at lastScoredRound + 1 in that case.
    const data = [r(1, 200_000, 60), r(2, 200_000, 80)];
    const map = deriveBEMap(data, 0);
    expect(map).not.toHaveProperty('3');
  });

  test('currentBE under upcoming round when player has scored history', () => {
    const data = [r(1, 200_000, 60), r(2, 200_000, 80)];
    const map = deriveBEMap(data, 42);
    expect(map[3]).toBe(42);
  });

  test('no currentBE entry when no rounds have been scored', () => {
    // Pre-season: roundData might have placeholder rows but no scores yet.
    // Don't pin currentBE to a specific upcoming round — caller's choice.
    const data: RoundDataRow[] = [r(1, 99_100, null)];
    const map = deriveBEMap(data, 20);
    expect(map).toEqual({});
  });
});

describe('deriveBEMap — empty / degenerate input', () => {
  test('empty roundData returns empty map', () => {
    expect(deriveBEMap([], 0)).toEqual({});
  });

  test('all-DNP roundData returns empty map', () => {
    const data = [r(1, 200_000, null), r(2, 200_000, null)];
    expect(deriveBEMap(data, 0)).toEqual({});
  });
});

describe('splitBEMap', () => {
  test('current-year split puts upcoming round in live, rest in frozen', () => {
    const data = [
      r(0, 700_000, 117),
      r(1, 700_000, 89),
      r(2, 680_000, 145),
    ];
    const beMap = deriveBEMap(data, 50);
    const { frozen, live } = splitBEMap(beMap, data, true);

    expect(frozen).toEqual({
      0: beMap[0],
      1: beMap[1],
      2: beMap[2],
    });
    expect(live).toEqual({ 3: 50 });
  });

  test('past-year split puts everything in frozen', () => {
    const data = [
      r(1, 500_000, 90),
      r(2, 500_000, 100),
      r(3, 480_000, 110),
    ];
    const beMap = deriveBEMap(data, 0);
    const { frozen, live } = splitBEMap(beMap, data, false);

    expect(Object.keys(live)).toEqual([]);
    expect(frozen).toEqual(beMap);
  });

  test('split handles empty maps cleanly', () => {
    const { frozen, live } = splitBEMap({}, [], true);
    expect(frozen).toEqual({});
    expect(live).toEqual({});
  });
});
