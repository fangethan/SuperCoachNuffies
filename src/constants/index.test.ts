import {
  SC_MAGIC,
  SC_DOLLARS_PER_POINT,
  SC_STARTING_BE_DIVISOR,
  CURRENT_YEAR,
  CURRENT_ROUND,
  POSITIONS,
  SC_WEIGHTS,
  SC_STAT_LABELS,
} from './index';

describe('SuperCoach pricing constants', () => {
  test('SC_DOLLARS_PER_POINT equals SC_MAGIC / 9', () => {
    // The flat $/point factor is defined as M/9. Both constants are exported
    // separately so call sites can use whichever reads more clearly. Drift
    // between them would silently mis-derive every BE in the app.
    expect(SC_DOLLARS_PER_POINT).toBe(SC_MAGIC / 9);
  });

  test('SC_MAGIC sits inside the calibrated band', () => {
    // Calibrated round-8 2026 against Gawn / Xerri / Bonti / Retschko —
    // they cluster at 4070–4090. Treat anything wildly outside that as a
    // calibration regression worth catching at test time.
    expect(SC_MAGIC).toBeGreaterThanOrEqual(4000);
    expect(SC_MAGIC).toBeLessThanOrEqual(4150);
  });

  test('SC_STARTING_BE_DIVISOR is 5000', () => {
    // SC's pre-season convention: starting_price = projected_avg × 5000,
    // so starting_BE = price / 5000 for unplayed players. Verified with 7
    // unplayed players at season open (Cotton, Ludowyke, West, Archer,
    // Green, Day, Conway).
    expect(SC_STARTING_BE_DIVISOR).toBe(5000);
  });
});

describe('Season constants', () => {
  test('CURRENT_YEAR is a four-digit year', () => {
    expect(CURRENT_YEAR).toBeGreaterThanOrEqual(2024);
    expect(CURRENT_YEAR).toBeLessThanOrEqual(2100);
  });

  test('CURRENT_ROUND is between 0 and 30', () => {
    expect(CURRENT_ROUND).toBeGreaterThanOrEqual(0);
    expect(CURRENT_ROUND).toBeLessThanOrEqual(30);
  });
});

describe('Position metadata', () => {
  test('every position has label, color, and long form', () => {
    for (const key of ['DEF', 'MID', 'FWD', 'RUC'] as const) {
      const p = POSITIONS[key];
      expect(p.label).toBe(key);
      expect(p.long.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('SC stat weight + label tables', () => {
  test('every weighted stat has a human label', () => {
    // Otherwise the Stat DNA tab would render a stat key with no friendly
    // name. Fail loudly at test time rather than silently in the UI.
    for (const stat of Object.keys(SC_WEIGHTS)) {
      expect(SC_STAT_LABELS).toHaveProperty(stat);
    }
  });

  test('every labelled stat has a weight', () => {
    for (const stat of Object.keys(SC_STAT_LABELS)) {
      expect(SC_WEIGHTS).toHaveProperty(stat);
    }
  });
});
