import { PlayerStats, ScoreBreakdownItem } from '../types';
import { SC_WEIGHTS, SC_STAT_LABELS } from '../constants';

type StatKey = keyof typeof SC_WEIGHTS;

export function calculateScScore(stats: PlayerStats): number {
  let total = 0;
  for (const [stat, weight] of Object.entries(SC_WEIGHTS)) {
    const value = (stats as unknown as Record<string, number>)[stat] ?? 0;
    total += value * weight;
  }
  return Math.round(total);
}

export function getScoreBreakdown(stats: PlayerStats): ScoreBreakdownItem[] {
  const items: ScoreBreakdownItem[] = [];

  for (const [stat, weight] of Object.entries(SC_WEIGHTS)) {
    const count = (stats as unknown as Record<string, number>)[stat] ?? 0;
    const points = count * weight;
    if (count === 0) continue;
    items.push({
      label: SC_STAT_LABELS[stat] ?? stat,
      stat,
      count,
      points,
    });
  }

  // Sort by absolute points contribution descending
  return items.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
}

export function getPriceDirection(priceChange: number): 'up' | 'down' | 'neutral' {
  if (priceChange > 0) return 'up';
  if (priceChange < 0) return 'down';
  return 'neutral';
}

export function formatPrice(price: number): string {
  return `$${(price / 1000).toFixed(1)}k`;
}

export function formatPriceChange(change: number): string {
  if (change === 0) return '-';
  const sign = change > 0 ? '+' : '';
  return `${sign}$${(change / 1000).toFixed(1)}k`;
}

export function getBreakevenStatus(
  score: number,
  breakeven: number
): 'above' | 'below' | 'at' {
  if (score > breakeven) return 'above';
  if (score < breakeven) return 'below';
  return 'at';
}

// Captain score = double points
export function getCaptainScore(score: number): number {
  return score * 2;
}

// Score a player's captaincy appeal (0-100)
export function getCaptainRating(
  avg3: number,
  avg5: number,
  oppavg: number,
  venavg: number,
  togp: number
): number {
  const formScore = (avg3 * 0.5 + avg5 * 0.3) / 1.5;
  const matchupBonus = oppavg > 80 ? 10 : oppavg > 70 ? 5 : 0;
  const venueBonus = venavg > 100 ? 5 : 0;
  const togBonus = togp >= 80 ? 10 : togp >= 70 ? 5 : 0;
  return Math.min(100, Math.round(formScore * 0.55 + matchupBonus + venueBonus + togBonus));
}
