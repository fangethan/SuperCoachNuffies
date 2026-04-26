import { PlayerStats } from '../types';

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

export function getBreakevenStatus(score: number, breakeven: number): 'above' | 'below' | 'at' {
  if (score > breakeven) return 'above';
  if (score < breakeven) return 'below';
  return 'at';
}

export function getCaptainScore(score: number): number {
  return score * 2;
}

// togp is optional — omit the TOG bonus when it's not available (0)
export function getCaptainRating(
  avg3: number,
  avg5: number,
  oppavg: number,
  venavg: number,
  togp: number,
): number {
  const formScore    = (avg3 * 0.5 + avg5 * 0.3) / 1.5;
  const matchupBonus = oppavg > 80 ? 10 : oppavg > 70 ? 5 : 0;
  const venueBonus   = venavg > 100 ? 5 : 0;
  const togBonus     = togp > 0 ? (togp >= 80 ? 10 : togp >= 70 ? 5 : 0) : 0;
  return Math.min(100, Math.round(formScore * 0.55 + matchupBonus + venueBonus + togBonus));
}
