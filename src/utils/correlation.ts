import { Player, PlayerStats, PositionFilter, StatCorrelation } from '../types';
import { SC_STAT_LABELS } from '../constants';

const ANALYSED_STATS = [
  'ek', 'ck', 'kla', 'ehb', 'chb', 'hbr', 'hbg', 'lbg',
  'goals', 'behinds', 'ga', 'mu', 'mc', 'muo', 'mco', 'lm',
  'ko', 'koc', 'sm', 'sp', 'tackles', 'freekicks_for',
  'freekicks_against', 'hta', 'gfh', 'tihs', 'buhs', 'cbhs',
  'cba', 'togp',
];

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : num / denom;
}

function getPlayerPosition(player: Player): PositionFilter {
  if (!player.positions?.length) return 'ALL';
  return player.positions[0].position as PositionFilter;
}

export function computeStatCorrelations(
  players: Player[],
  position: PositionFilter = 'ALL'
): StatCorrelation[] {
  const filtered = position === 'ALL'
    ? players
    : players.filter(p => getPlayerPosition(p) === position);

  // Collect (stat_value, sc_points) pairs from all player stats entries
  const statData: Record<string, { xs: number[]; ys: number[] }> = {};
  ANALYSED_STATS.forEach(s => { statData[s] = { xs: [], ys: [] }; });

  filtered.forEach(player => {
    player.player_stats?.forEach(stats => {
      if (stats.points === 0 && stats.games === 0) return; // skip DNP
      ANALYSED_STATS.forEach(stat => {
        const val = (stats as unknown as Record<string, number>)[stat] ?? 0;
        statData[stat].xs.push(val);
        statData[stat].ys.push(stats.points);
      });
    });
  });

  return ANALYSED_STATS.map(stat => ({
    stat,
    label: SC_STAT_LABELS[stat] ?? stat,
    correlation: parseFloat(
      pearsonCorrelation(statData[stat].xs, statData[stat].ys).toFixed(3)
    ),
    position,
  })).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}
