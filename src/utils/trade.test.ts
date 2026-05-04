import { Player, PlayerStats } from '../types';
import { getTradeInTargets, getTradeOutTargets } from './trade';

/**
 * Build a Player with only the fields the trade scoring touches. Everything
 * else defaults to a sensible neutral so we don't accidentally bias the
 * score. The cast through unknown keeps TypeScript honest about the parts
 * we're omitting.
 */
function mkPlayer(opts: {
  id?: number;
  position?: 'DEF' | 'MID' | 'FWD' | 'RUC';
  team?: string;
  active?: boolean;
  injured?: string | null;
  stats?: Partial<PlayerStats>;
}): Player {
  const stats: Partial<PlayerStats> = {
    avg: 80, avg3: 80, avg5: 80,
    price: 500_000,
    price_change: 0,
    ppts: 80,
    oppavg: 70,
    togp: 80,
    games: 8,
    ...opts.stats,
  };
  return {
    id: opts.id ?? 1,
    first_name: 'Test',
    last_name: 'Player',
    active: opts.active ?? true,
    injury_suspension_status: opts.injured ?? null,
    team: { id: 1, abbrev: opts.team ?? 'CAR', name: opts.team ?? 'Carlton' },
    positions: [
      { position: opts.position ?? 'MID', position_long: 'Midfielder', sort: 1 },
    ],
    player_stats: [stats as PlayerStats],
  } as unknown as Player;
}

describe('getTradeInTargets', () => {
  test('excludes injured / suspended players', () => {
    const players = [
      mkPlayer({ id: 1 }),
      mkPlayer({ id: 2, injured: 'Hamstring' }),
    ];
    const targets = getTradeInTargets(players);
    expect(targets.map(t => t.player.id)).toEqual([1]);
  });

  test('excludes inactive players', () => {
    const players = [
      mkPlayer({ id: 1 }),
      mkPlayer({ id: 2, active: false }),
    ];
    const targets = getTradeInTargets(players);
    expect(targets.map(t => t.player.id)).toEqual([1]);
  });

  test('respects position filter', () => {
    const players = [
      mkPlayer({ id: 1, position: 'DEF' }),
      mkPlayer({ id: 2, position: 'MID' }),
      mkPlayer({ id: 3, position: 'FWD' }),
    ];
    const targets = getTradeInTargets(players, 'MID');
    expect(targets.map(t => t.player.id)).toEqual([2]);
  });

  test('respects maxPrice filter', () => {
    const players = [
      mkPlayer({ id: 1, stats: { price: 400_000 } }),
      mkPlayer({ id: 2, stats: { price: 800_000 } }),
    ];
    const targets = getTradeInTargets(players, 'ALL', 600_000);
    expect(targets.map(t => t.player.id)).toEqual([1]);
  });

  test('rising form scores higher than declining form', () => {
    const rising = mkPlayer({
      id: 1,
      stats: { avg3: 110, avg5: 95, avg: 90, price_change: 20_000, ppts: 70 },
    });
    const declining = mkPlayer({
      id: 2,
      stats: { avg3: 70, avg5: 90, avg: 100, price_change: -20_000, ppts: 110 },
    });
    const targets = getTradeInTargets([rising, declining]);
    // Rising should rank higher (more reasons for the bonuses to fire).
    expect(targets[0].player.id).toBe(1);
    expect(targets[0].score).toBeGreaterThan(targets[1].score);
  });

  test('caps at top 20 results', () => {
    const players = Array.from({ length: 30 }, (_, i) =>
      mkPlayer({ id: i + 1, stats: { avg3: 90, avg5: 85, avg: 80 } }),
    );
    expect(getTradeInTargets(players).length).toBe(20);
  });

  test('returned reasons are non-empty for any qualifying signal', () => {
    const player = mkPlayer({
      id: 1,
      stats: { avg3: 110, avg: 90, price_change: 25_000, ppts: 70, oppavg: 80 },
    });
    const [target] = getTradeInTargets([player]);
    expect(target.reasons.length).toBeGreaterThan(0);
  });
});

describe('getTradeOutTargets', () => {
  test('declining-form player ranks above stable form', () => {
    const declining = mkPlayer({
      id: 1,
      stats: { avg3: 50, avg5: 70, avg: 90, price_change: -25_000, ppts: 110 },
    });
    const stable = mkPlayer({
      id: 2,
      stats: { avg3: 80, avg5: 80, avg: 80, price_change: 0, ppts: 80 },
    });
    const targets = getTradeOutTargets([declining, stable], {}, 8);
    expect(targets[0].player.id).toBe(1);
  });

  test('flags injured players with a higher score', () => {
    const healthy = mkPlayer({ id: 1 });
    const injured = mkPlayer({ id: 2, injured: 'ACL' });
    const targets = getTradeOutTargets([healthy, injured], {}, 8);
    // Injury contributes a +25 bump regardless of form.
    const injuredTarget = targets.find(t => t.player.id === 2)!;
    const healthyTarget = targets.find(t => t.player.id === 1)!;
    expect(injuredTarget.score).toBeGreaterThan(healthyTarget.score);
  });

  test('next-round bye adds a "Bye next round" reason', () => {
    const player = mkPlayer({ id: 1, team: 'Carlton' });
    const byeMap = { Carlton: [9] };
    const targets = getTradeOutTargets([player], byeMap, 8);
    expect(targets[0].reasons.some(r => r.includes('Bye next round'))).toBe(true);
  });

  test('does not flag bye when next round is not in the team’s bye list', () => {
    const player = mkPlayer({ id: 1, team: 'Carlton' });
    const byeMap = { Carlton: [12] };
    const targets = getTradeOutTargets([player], byeMap, 8);
    expect(targets[0].reasons.every(r => !r.includes('Bye next round'))).toBe(true);
  });

  test('caps at top 10 results', () => {
    const players = Array.from({ length: 20 }, (_, i) =>
      mkPlayer({ id: i + 1, stats: { avg3: 50, avg5: 70, avg: 90 } }),
    );
    expect(getTradeOutTargets(players, {}, 8).length).toBe(10);
  });

  test('skips inactive players', () => {
    const players = [
      mkPlayer({ id: 1 }),
      mkPlayer({ id: 2, active: false }),
    ];
    const targets = getTradeOutTargets(players, {}, 8);
    expect(targets.map(t => t.player.id)).not.toContain(2);
  });
});
