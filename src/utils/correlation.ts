import { Player, PositionFilter, StatCorrelation } from '../types';
import { SC_WEIGHTS, SC_STAT_LABELS } from '../constants';

// Estimated average times a stat occurs per game, per position type.
// Used to weight the formula points by how frequently a stat is actually achieved.
const AVG_COUNTS: Record<string, number> = {
  ek: 7,  ck: 2,   kla: 1.5, ehb: 6, chb: 1,   hbr: 5,  hbg: 3,  lbg: 3,
  goals: 0.7, behinds: 0.5, ga: 0.4, ba: 0.3,
  mu: 2,  mc: 0.8, muo: 1,   mco: 0.4, lm: 0.6,
  ko: 1,  koc: 0.5, sm: 0.3, sp: 1.2,
  tackles: 3.5, freekicks_for: 1, freekicks_against: 1,
  hta: 2, gfh: 0.5, tihs: 0.5, buhs: 0.5, cbhs: 0.5,
};

// Position-specific activity multipliers — how much more/less a stat is relevant
// relative to the average player.
const POS_BOOST: Record<string, Record<string, number>> = {
  DEF: { sp: 2.5, tackles: 1.3, ek: 1.1, chb: 1.2, ck: 1.2 },
  MID: { hbg: 1.6, lbg: 1.6, ek: 1.2, tackles: 1.3, kla: 1.2 },
  FWD: { goals: 2.5, mco: 2.0, ga: 1.8, lm: 2.0, muo: 1.2 },
  RUC: { hta: 5.0, cbhs: 4.0, buhs: 4.0, tihs: 4.0, koc: 2.0, gfh: 2.5, mu: 1.5 },
};

export function computeStatCorrelations(
  _players: Player[],  // kept for API compatibility; data comes from formula weights
  position: PositionFilter = 'ALL',
): StatCorrelation[] {
  const boosts = position !== 'ALL' ? (POS_BOOST[position] ?? {}) : {};

  const results = Object.entries(SC_WEIGHTS)
    .filter(([, weight]) => weight !== 0)
    .map(([stat, weight]) => {
      const avgCount = AVG_COUNTS[stat] ?? 1;
      const posBoost = boosts[stat] ?? 1;
      // Expected SC points contribution per game from this stat
      const expectedPts = weight * avgCount * posBoost;
      // Normalise to a -1..1 range (goals at avg count = 8 * 0.7 = 5.6 pts → ~1.0 when /6)
      const normalised = parseFloat((expectedPts / 6).toFixed(2));
      return {
        stat,
        label: SC_STAT_LABELS[stat] ?? stat,
        correlation: normalised,
        position,
      };
    })
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return results;
}
