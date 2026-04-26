import { Player, PlayerStats, PositionFilter } from '../types';

export interface TradeTarget {
  player: Player;
  stats: PlayerStats;
  score: number;
  reasons: string[];
}

function getStats(player: Player): PlayerStats | null {
  return player.player_stats?.[0] ?? null;
}

function getPosition(player: Player): PositionFilter {
  return (player.positions?.[0]?.position ?? 'ALL') as PositionFilter;
}

// Score a player's trade-in appeal (higher = better to bring in)
function tradeInScore(player: Player, stats: PlayerStats): number {
  let score = 0;
  const reasons: string[] = [];

  // Rising form: avg3 > avg5 > season avg
  if (stats.avg3 > stats.avg && stats.avg3 > 80) score += 25;
  if (stats.avg3 > stats.avg5) score += 10;

  // Price is rising (good value entry before price goes up)
  if (stats.price_change > 0) score += 15;

  // Low breakeven = price will keep rising
  if (stats.ppts < stats.avg3) score += 20;

  // Good matchup
  if (stats.oppavg > 75) score += 10;

  // High TOG (skip when not available)
  if (stats.togp > 0 && stats.togp >= 75) score += 10;

  // Not injured
  if (!player.injury_suspension_status) score += 10;

  return score;
}

// Score a player's trade-out urgency (higher = more urgent to trade out)
function tradeOutScore(player: Player, stats: PlayerStats): number {
  let score = 0;

  // Declining form
  if (stats.avg3 < stats.avg5 && stats.avg5 < stats.avg) score += 25;

  // Price falling
  if (stats.price_change < 0) score += 20;

  // Breakeven higher than avg (will keep losing value)
  if (stats.ppts > stats.avg3) score += 20;

  // Bad matchup
  if (stats.oppavg < 55) score += 10;

  // Injured or suspended
  if (player.injury_suspension_status) score += 25;

  // Very low TOG (skip when not available)
  if (stats.togp > 0 && stats.togp < 60 && stats.games > 0) score += 10;

  return score;
}

export function getTradeInTargets(
  players: Player[],
  position: PositionFilter = 'ALL',
  maxPrice?: number
): TradeTarget[] {
  return players
    .filter(p => {
      if (!p.active) return false;
      if (p.injury_suspension_status) return false;
      if (position !== 'ALL' && getPosition(p) !== position) return false;
      const stats = getStats(p);
      if (!stats) return false;
      if (maxPrice && stats.price > maxPrice) return false;
      return true;
    })
    .map(player => {
      const stats = getStats(player)!;
      const score = tradeInScore(player, stats);
      const reasons: string[] = [];
      if (stats.avg3 > stats.avg) reasons.push(`Rising form (${stats.avg3.toFixed(0)} avg last 3)`);
      if (stats.price_change > 0) reasons.push(`Price rising +${(stats.price_change / 1000).toFixed(1)}k`);
      if (stats.ppts < stats.avg3) reasons.push(`BE ${stats.ppts} below avg`);
      if (stats.oppavg > 75) reasons.push(`Good matchup vs ${stats.opp?.abbrev}`);
      return { player, stats, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

export function getTradeOutTargets(
  myTeam: Player[],
  byeMap: Record<string, number[]>,
  currentRound: number
): TradeTarget[] {
  return myTeam
    .filter(p => p.active)
    .map(player => {
      const stats = getStats(player);
      if (!stats) return null;
      const score = tradeOutScore(player, stats);
      const reasons: string[] = [];
      if (stats.avg3 < stats.avg) reasons.push(`Declining form (${stats.avg3.toFixed(0)} avg last 3)`);
      if (stats.price_change < 0) reasons.push(`Price falling ${(stats.price_change / 1000).toFixed(1)}k`);
      if (stats.ppts > stats.avg3) reasons.push(`BE ${stats.ppts} above avg`);
      if (player.injury_suspension_status) reasons.push(player.injury_suspension_status_text ?? 'Injured');
      const byeRounds = byeMap[player.team.name] ?? [];
      const nextBye = byeRounds.find(r => r === currentRound + 1);
      if (nextBye) reasons.push(`Bye next round (R${nextBye})`);
      return { player, stats, score, reasons };
    })
    .filter((x): x is TradeTarget => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
