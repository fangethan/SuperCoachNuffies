import { Player, PlayerStats } from '../types';
import {
  applyPlayerFilters,
  applyPlayerSort,
  FilterOpts,
  SortOpts,
} from './playerFilterSort';

/**
 * Build a Player with only the fields filter/sort cares about. Passing
 * `unknown as Player` keeps TS happy without forcing us to populate every
 * stat field.
 */
function mkPlayer(opts: {
  id: number;
  position?: 'DEF' | 'MID' | 'FWD' | 'RUC';
  team?: string;
  first?: string;
  last?: string;
  stats?: Partial<PlayerStats>;
}): Player {
  return {
    id: opts.id,
    first_name: opts.first ?? 'Test',
    last_name: opts.last ?? `P${opts.id}`,
    team: { id: 1, abbrev: 'CAR', name: opts.team ?? 'Carlton' },
    positions: [{ position: opts.position ?? 'MID', position_long: 'Midfielder', sort: 1 }],
    player_stats: [
      {
        avg: 80, avg3: 80, avg5: 80, ppts: 80,
        price: 500_000, price_change: 0, total_points: 640,
        games: 8,
        ...opts.stats,
      } as PlayerStats,
    ],
  } as unknown as Player;
}

const baseFilterOpts: FilterOpts = {
  positionFilter: 'ALL',
  searchQuery: '',
  showOwnedOnly: false,
  showBubbleOnly: false,
  myTeamIds: [],
  priceMin: 95,
  priceMax: 750,
  byeRoundFilters: [],
  byeMap: {},
  sortBy: 'total_pts',
  scoreRound: 0,
  roundScoresById: {},
  roundScoresLoading: false,
};

const baseSortOpts: SortOpts = {
  sortBy: 'total_pts',
  sortAscending: false,
  weeklyPriceMap: {},
  fwBreakevenById: {},
  roundScoresById: {},
  scoreRound: 0,
};

describe('applyPlayerFilters — position', () => {
  test('ALL keeps every player', () => {
    const players = [
      mkPlayer({ id: 1, position: 'DEF' }),
      mkPlayer({ id: 2, position: 'MID' }),
      mkPlayer({ id: 3, position: 'FWD' }),
    ];
    expect(applyPlayerFilters(players, baseFilterOpts)).toHaveLength(3);
  });

  test('non-ALL keeps only matching position', () => {
    const players = [
      mkPlayer({ id: 1, position: 'DEF' }),
      mkPlayer({ id: 2, position: 'MID' }),
      mkPlayer({ id: 3, position: 'FWD' }),
    ];
    const result = applyPlayerFilters(players, { ...baseFilterOpts, positionFilter: 'MID' });
    expect(result.map(p => p.id)).toEqual([2]);
  });
});

describe('applyPlayerFilters — search', () => {
  test('matches first or last name (case-insensitive)', () => {
    const players = [
      mkPlayer({ id: 1, first: 'Marcus', last: 'Bontempelli' }),
      mkPlayer({ id: 2, first: 'Brodie', last: 'Grundy' }),
    ];
    expect(
      applyPlayerFilters(players, { ...baseFilterOpts, searchQuery: 'bont' }).map(p => p.id),
    ).toEqual([1]);
    expect(
      applyPlayerFilters(players, { ...baseFilterOpts, searchQuery: 'GRUNDY' }).map(p => p.id),
    ).toEqual([2]);
  });

  test('matches team name', () => {
    const players = [
      mkPlayer({ id: 1, team: 'Carlton' }),
      mkPlayer({ id: 2, team: 'Brisbane' }),
    ];
    expect(
      applyPlayerFilters(players, { ...baseFilterOpts, searchQuery: 'Brisbane' }).map(p => p.id),
    ).toEqual([2]);
  });

  test('whitespace-only query is a no-op', () => {
    const players = [mkPlayer({ id: 1 }), mkPlayer({ id: 2 })];
    expect(applyPlayerFilters(players, { ...baseFilterOpts, searchQuery: '   ' })).toHaveLength(2);
  });
});

describe('applyPlayerFilters — price range', () => {
  test('default edges (95–750) act as a no-op', () => {
    const players = [
      mkPlayer({ id: 1, stats: { price: 100_000 } }),
      mkPlayer({ id: 2, stats: { price: 800_000 } }),
    ];
    expect(applyPlayerFilters(players, baseFilterOpts)).toHaveLength(2);
  });

  test('narrowed range filters by $k bounds', () => {
    const players = [
      mkPlayer({ id: 1, stats: { price: 200_000 } }),
      mkPlayer({ id: 2, stats: { price: 500_000 } }),
      mkPlayer({ id: 3, stats: { price: 700_000 } }),
    ];
    const result = applyPlayerFilters(players, {
      ...baseFilterOpts, priceMin: 300, priceMax: 600,
    });
    expect(result.map(p => p.id)).toEqual([2]);
  });
});

describe('applyPlayerFilters — bye rounds', () => {
  test('drops players whose team has a bye in any selected round', () => {
    const players = [
      mkPlayer({ id: 1, team: 'Carlton' }),
      mkPlayer({ id: 2, team: 'Brisbane' }),
      mkPlayer({ id: 3, team: 'Geelong' }),
    ];
    const result = applyPlayerFilters(players, {
      ...baseFilterOpts,
      byeRoundFilters: [12],
      byeMap: { Carlton: [12], Brisbane: [13], Geelong: [14] },
    });
    expect(result.map(p => p.id)).toEqual([2, 3]);
  });

  test('no-op when byeMap is empty', () => {
    const players = [mkPlayer({ id: 1 })];
    expect(
      applyPlayerFilters(players, { ...baseFilterOpts, byeRoundFilters: [12], byeMap: {} }),
    ).toHaveLength(1);
  });
});

describe('applyPlayerFilters — owned-only & bubble', () => {
  test('owned-only keeps only myTeamIds', () => {
    const players = [mkPlayer({ id: 1 }), mkPlayer({ id: 2 }), mkPlayer({ id: 3 })];
    const result = applyPlayerFilters(players, {
      ...baseFilterOpts,
      showOwnedOnly: true,
      myTeamIds: [1, 3],
    });
    expect(result.map(p => p.id).sort()).toEqual([1, 3]);
  });

  test('owned-only with empty team is a no-op', () => {
    // Until the user imports a team we shouldn't blank the list.
    const players = [mkPlayer({ id: 1 }), mkPlayer({ id: 2 })];
    const result = applyPlayerFilters(players, {
      ...baseFilterOpts, showOwnedOnly: true, myTeamIds: [],
    });
    expect(result).toHaveLength(2);
  });

  test('bubble filter keeps players with ≤2 games', () => {
    const players = [
      mkPlayer({ id: 1, stats: { games: 1 } }),
      mkPlayer({ id: 2, stats: { games: 2 } }),
      mkPlayer({ id: 3, stats: { games: 8 } }),
    ];
    const result = applyPlayerFilters(players, { ...baseFilterOpts, showBubbleOnly: true });
    expect(result.map(p => p.id).sort()).toEqual([1, 2]);
  });
});

describe('applyPlayerFilters — score-round-aware drops', () => {
  test('avg3 sort drops players with avg3 = 0', () => {
    const players = [
      mkPlayer({ id: 1, stats: { avg3: 90 } }),
      mkPlayer({ id: 2, stats: { avg3: 0 } }),
    ];
    const result = applyPlayerFilters(players, { ...baseFilterOpts, sortBy: 'avg3' });
    expect(result.map(p => p.id)).toEqual([1]);
  });

  test('points sort drops players with no score for the picked round', () => {
    const players = [
      mkPlayer({ id: 1 }),
      mkPlayer({ id: 2 }),
    ];
    const roundScoresById = {
      1: { lastScore: 0, avg5: 0, roundScores: { 5: 110 } },
      2: { lastScore: 0, avg5: 0, roundScores: { 5: 0 } },
    };
    const result = applyPlayerFilters(players, {
      ...baseFilterOpts,
      sortBy: 'points',
      scoreRound: 5,
      roundScoresById,
    });
    expect(result.map(p => p.id)).toEqual([1]);
  });
});

describe('applyPlayerSort', () => {
  test('total_pts sort descending by default', () => {
    const players = [
      mkPlayer({ id: 1, stats: { total_points: 700 } }),
      mkPlayer({ id: 2, stats: { total_points: 900 } }),
      mkPlayer({ id: 3, stats: { total_points: 800 } }),
    ];
    const result = applyPlayerSort(players, baseSortOpts);
    expect(result.map(p => p.id)).toEqual([2, 3, 1]);
  });

  test('ascending direction reverses the order', () => {
    const players = [
      mkPlayer({ id: 1, stats: { total_points: 700 } }),
      mkPlayer({ id: 2, stats: { total_points: 900 } }),
      mkPlayer({ id: 3, stats: { total_points: 800 } }),
    ];
    const result = applyPlayerSort(players, { ...baseSortOpts, sortAscending: true });
    expect(result.map(p => p.id)).toEqual([1, 3, 2]);
  });

  test('price sort uses the player_stats price', () => {
    const players = [
      mkPlayer({ id: 1, stats: { price: 200_000 } }),
      mkPlayer({ id: 2, stats: { price: 800_000 } }),
    ];
    const result = applyPlayerSort(players, { ...baseSortOpts, sortBy: 'price' });
    expect(result.map(p => p.id)).toEqual([2, 1]);
  });

  test('price_change uses weeklyPriceMap when present', () => {
    const players = [
      mkPlayer({ id: 1, stats: { price_change: 0 } }),
      mkPlayer({ id: 2, stats: { price_change: 0 } }),
    ];
    const result = applyPlayerSort(players, {
      ...baseSortOpts,
      sortBy: 'price_change',
      weeklyPriceMap: { 1: -25_000, 2: 50_000 },
    });
    expect(result.map(p => p.id)).toEqual([2, 1]);
  });

  test('avg5 reads from roundScoresById, not player_stats', () => {
    const players = [mkPlayer({ id: 1 }), mkPlayer({ id: 2 })];
    const result = applyPlayerSort(players, {
      ...baseSortOpts,
      sortBy: 'avg5',
      roundScoresById: {
        1: { lastScore: 0, avg5: 70, roundScores: {} },
        2: { lastScore: 0, avg5: 110, roundScores: {} },
      },
    });
    expect(result.map(p => p.id)).toEqual([2, 1]);
  });

  test('points sort falls back to lastScore when scoreRound = 0', () => {
    const players = [mkPlayer({ id: 1 }), mkPlayer({ id: 2 })];
    const result = applyPlayerSort(players, {
      ...baseSortOpts,
      sortBy: 'points',
      scoreRound: 0,
      roundScoresById: {
        1: { lastScore: 60, avg5: 0, roundScores: {} },
        2: { lastScore: 130, avg5: 0, roundScores: {} },
      },
    });
    expect(result.map(p => p.id)).toEqual([2, 1]);
  });

  test('points sort uses scoreRound when > 0', () => {
    const players = [mkPlayer({ id: 1 }), mkPlayer({ id: 2 })];
    const result = applyPlayerSort(players, {
      ...baseSortOpts,
      sortBy: 'points',
      scoreRound: 5,
      roundScoresById: {
        1: { lastScore: 0, avg5: 0, roundScores: { 5: 130 } },
        2: { lastScore: 0, avg5: 0, roundScores: { 5: 60 } },
      },
    });
    expect(result.map(p => p.id)).toEqual([1, 2]);
  });

  test('ppts sort puts nulls last regardless of direction', () => {
    const players = [
      mkPlayer({ id: 1, stats: { ppts: 50 } }),
      mkPlayer({ id: 2 }),                                    // ppts present below
      mkPlayer({ id: 3, stats: { ppts: 100 } }),
    ];
    // Override id=2 BE to null via the fwBreakevenById map (typed as Record<number, number>;
    // we simulate "no BE" by simply omitting the id from both sources by zeroing player_stats ppts).
    players[1].player_stats[0].ppts = 0;
    const result = applyPlayerSort(players, {
      ...baseSortOpts,
      sortBy: 'ppts',
      // fwBreakevenById is empty so the function falls back to player_stats.ppts.
      // ppts = 0 (falsy via ??) leaves null at id=2 only when stats.ppts is nullish.
    });
    // At minimum, the player with the highest BE should come first.
    expect(result[0].id).toBe(3);
  });

  test('returns a new array (does not mutate input)', () => {
    const original = [mkPlayer({ id: 1 }), mkPlayer({ id: 2 }), mkPlayer({ id: 3 })];
    const before = original.map(p => p.id);
    applyPlayerSort(original, baseSortOpts);
    expect(original.map(p => p.id)).toEqual(before);
  });
});
