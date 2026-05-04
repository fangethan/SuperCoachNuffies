import { computeStatCorrelations } from './correlation';
import { Player } from '../types';

describe('computeStatCorrelations', () => {
  // The function ignores the players array (kept for API compatibility) and
  // derives correlations from the formula weights × per-position activity
  // boosts. We can pass an empty array.
  const noPlayers: Player[] = [];

  test('returns one row per non-zero SC weight', () => {
    const results = computeStatCorrelations(noPlayers, 'ALL');
    // ek (4) is non-zero, ik (0) is zero — verify only non-zero stats are included.
    expect(results.find(r => r.stat === 'ek')).toBeDefined();
    expect(results.find(r => r.stat === 'ik')).toBeUndefined();
  });

  test('every row has a label populated from SC_STAT_LABELS', () => {
    const results = computeStatCorrelations(noPlayers, 'ALL');
    for (const row of results) {
      expect(row.label).toBeTruthy();
      expect(row.label).not.toBe(row.stat); // label is human-readable, not the key
    }
  });

  test('clangers register as negative correlations', () => {
    // Negative SC weights (clanger kicks, free kicks against) must surface
    // as negative correlation so the UI renders them red.
    const results = computeStatCorrelations(noPlayers, 'ALL');
    const ck = results.find(r => r.stat === 'ck')!;
    const fka = results.find(r => r.stat === 'freekicks_against')!;
    expect(ck.correlation).toBeLessThan(0);
    expect(fka.correlation).toBeLessThan(0);
  });

  test('RUC boost lifts hitouts relative to ALL', () => {
    // Hitouts-to-advantage gets a 5× multiplier for RUC. Compare to the
    // un-boosted 'ALL' baseline to confirm the position table is wired up.
    const all = computeStatCorrelations(noPlayers, 'ALL').find(r => r.stat === 'hta')!;
    const ruc = computeStatCorrelations(noPlayers, 'RUC').find(r => r.stat === 'hta')!;
    expect(ruc.correlation).toBeGreaterThan(all.correlation);
  });

  test('FWD boost lifts goals more than RUC', () => {
    // Goals × 2.5 boost for FWDs only. RUCs don't get a goals boost.
    const fwd = computeStatCorrelations(noPlayers, 'FWD').find(r => r.stat === 'goals')!;
    const ruc = computeStatCorrelations(noPlayers, 'RUC').find(r => r.stat === 'goals')!;
    expect(fwd.correlation).toBeGreaterThan(ruc.correlation);
  });

  test('results sorted by absolute correlation desc', () => {
    const results = computeStatCorrelations(noPlayers, 'ALL');
    for (let i = 1; i < results.length; i++) {
      const prev = Math.abs(results[i - 1].correlation);
      const curr = Math.abs(results[i].correlation);
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  test('every row tags the requested position', () => {
    const results = computeStatCorrelations(noPlayers, 'MID');
    for (const row of results) {
      expect(row.position).toBe('MID');
    }
  });
});
