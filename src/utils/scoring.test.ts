import {
  getPriceDirection,
  formatPrice,
  formatPriceChange,
  getBreakevenStatus,
  getCaptainScore,
  getCaptainRating,
} from './scoring';

describe('getPriceDirection', () => {
  test('positive change → up', () => {
    expect(getPriceDirection(15_000)).toBe('up');
  });
  test('negative change → down', () => {
    expect(getPriceDirection(-25_000)).toBe('down');
  });
  test('zero change → neutral', () => {
    expect(getPriceDirection(0)).toBe('neutral');
  });
});

describe('formatPrice', () => {
  test('formats whole-thousand prices', () => {
    expect(formatPrice(700_000)).toBe('$700.0k');
  });
  test('formats fractional kilos', () => {
    expect(formatPrice(99_100)).toBe('$99.1k');
  });
  test('formats zero', () => {
    expect(formatPrice(0)).toBe('$0.0k');
  });
});

describe('formatPriceChange', () => {
  test('positive change adds + sign', () => {
    expect(formatPriceChange(50_500)).toBe('+$50.5k');
  });
  test('negative change renders the minus inside the dollar prefix', () => {
    // Current shape is `$-24.4k` (the dollar sign is fixed and the negative
    // comes from the number itself). Locking this so a future formatter
    // tweak surfaces deliberately rather than silently changing the UI.
    expect(formatPriceChange(-24_400)).toBe('$-24.4k');
  });
  test('zero change renders as a dash', () => {
    // Used to gray out "no movement" rows on the players list.
    expect(formatPriceChange(0)).toBe('-');
  });
});

describe('getBreakevenStatus', () => {
  test('score above BE', () => {
    expect(getBreakevenStatus(100, 80)).toBe('above');
  });
  test('score below BE', () => {
    expect(getBreakevenStatus(60, 80)).toBe('below');
  });
  test('score equal to BE', () => {
    expect(getBreakevenStatus(80, 80)).toBe('at');
  });
});

describe('getCaptainScore', () => {
  test('doubles the input', () => {
    expect(getCaptainScore(120)).toBe(240);
  });
  test('handles zero', () => {
    expect(getCaptainScore(0)).toBe(0);
  });
});

describe('getCaptainRating', () => {
  // The rating function is the heart of the Captain tab. Locking down its
  // shape — every component contributes, but score is capped at 100 — keeps
  // future tweaks honest.

  test('returns higher rating for stronger form', () => {
    const lowForm  = getCaptainRating(60, 60, 60, 60, 60);
    const highForm = getCaptainRating(120, 120, 60, 60, 60);
    expect(highForm).toBeGreaterThan(lowForm);
  });

  test('matchup bonus kicks in above oppAvg 70', () => {
    const noBonus      = getCaptainRating(100, 100, 60, 50, 50);   // oppAvg 60
    const tier1Bonus   = getCaptainRating(100, 100, 75, 50, 50);   // oppAvg 75 → +5
    const tier2Bonus   = getCaptainRating(100, 100, 90, 50, 50);   // oppAvg 90 → +10
    expect(tier1Bonus).toBeGreaterThan(noBonus);
    expect(tier2Bonus).toBeGreaterThan(tier1Bonus);
  });

  test('venue bonus only fires above 100', () => {
    const noBonus = getCaptainRating(100, 100, 50, 90, 50);
    const bonus   = getCaptainRating(100, 100, 50, 110, 50);
    expect(bonus - noBonus).toBe(5);
  });

  test('TOG bonus tiers at 70 and 80', () => {
    const lowTog    = getCaptainRating(100, 100, 50, 50, 60);   // 0
    const midTog    = getCaptainRating(100, 100, 50, 50, 75);   // +5
    const highTog   = getCaptainRating(100, 100, 50, 50, 85);   // +10
    expect(midTog - lowTog).toBe(5);
    expect(highTog - midTog).toBe(5);
  });

  test('TOG bonus skipped entirely when togp = 0 (data unavailable)', () => {
    // togp == 0 means we don't have TOG data, so we shouldn't penalise the
    // player relative to a low-but-known TOG. The function explicitly skips
    // the TOG branch when togp <= 0.
    const noTogData = getCaptainRating(100, 100, 50, 50, 0);
    const lowTog    = getCaptainRating(100, 100, 50, 50, 60);
    expect(noTogData).toBe(lowTog);
  });

  test('rating capped at 100', () => {
    // Form score of avg3=300 / avg5=300 gives formScore ≈ 160 → ×0.55 = 88,
    // plus matchup +10, venue +5, TOG +10 = 113 — clamps to 100.
    const max = getCaptainRating(300, 300, 100, 200, 100);
    expect(max).toBe(100);
  });

  test('rating is non-negative for sensible inputs', () => {
    expect(getCaptainRating(0, 0, 0, 0, 0)).toBeGreaterThanOrEqual(0);
  });
});
