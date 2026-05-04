import { Player, PositionFilter, SortOption } from '../types';
import { PlayerRoundScores } from '../api/footywire';

/**
 * Inputs for filtering the players list. Mirrors what the Zustand store
 * exposes (filters, sort, ownership) plus the bye map.
 */
export interface FilterOpts {
  positionFilter: PositionFilter;
  searchQuery: string;
  showOwnedOnly: boolean;
  showBubbleOnly: boolean;
  myTeamIds: number[];
  priceMin: number;                                  // dollars / 1000
  priceMax: number;                                  // dollars / 1000
  byeRoundFilters: number[];
  byeMap: Record<string, number[]>;                  // team name → bye rounds

  // Score-round-aware pre-filters (drop players with no score for the
  // round being viewed, so they don't pollute the sort).
  sortBy: SortOption;
  scoreRound: number;
  roundScoresById: Record<number, PlayerRoundScores>;
  roundScoresLoading: boolean;
}

export function applyPlayerFilters(players: Player[], opts: FilterOpts): Player[] {
  const {
    positionFilter, searchQuery, showOwnedOnly, showBubbleOnly,
    myTeamIds, priceMin, priceMax, byeRoundFilters, byeMap,
    sortBy, scoreRound, roundScoresById, roundScoresLoading,
  } = opts;

  let filtered = players;

  if (showOwnedOnly && myTeamIds.length > 0) {
    filtered = filtered.filter(p => myTeamIds.includes(p.id));
  }

  if (showBubbleOnly) {
    filtered = filtered.filter(p => (p.player_stats?.[0]?.games ?? 0) <= 2);
  }

  // Price slider edges ($95k–$750k) are no-ops; only filter when narrowed.
  if (priceMin > 95.0 || priceMax < 750.0) {
    filtered = filtered.filter(p => {
      const priceK = (p.player_stats?.[0]?.price ?? 0) / 1000;
      const passMin = priceMin <= 95.0  || priceK >= priceMin;
      const passMax = priceMax >= 750.0 || priceK <= priceMax;
      return passMin && passMax;
    });
  }

  // Bye round — drop players whose team is on bye in any of the selected rounds.
  if (byeRoundFilters.length > 0 && Object.keys(byeMap).length > 0) {
    filtered = filtered.filter(p => {
      const teamByes = byeMap[p.team?.name ?? ''] ?? [];
      return !byeRoundFilters.some(r => teamByes.includes(r));
    });
  }

  if (positionFilter !== 'ALL') {
    filtered = filtered.filter(p =>
      p.positions?.some(pos => pos.position === positionFilter)
    );
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      p.team.name.toLowerCase().includes(q)
    );
  }

  // Score-round-aware drop: when sorting by avg3 / avg5 / points, players
  // without a value for that metric should be dropped before sorting so the
  // top of the list isn't a wall of zeroes.
  if (!roundScoresLoading) {
    if (sortBy === 'avg3') {
      filtered = filtered.filter(p => (p.player_stats?.[0]?.avg3 ?? 0) > 0);
    } else if (sortBy === 'avg5') {
      filtered = filtered.filter(p => (roundScoresById[p.id]?.avg5 ?? 0) > 0);
    } else if (sortBy === 'points') {
      const getRoundScore = (id: number) =>
        scoreRound > 0
          ? (roundScoresById[id]?.roundScores?.[scoreRound] ?? 0)
          : (roundScoresById[id]?.lastScore ?? 0);
      filtered = filtered.filter(p => getRoundScore(p.id) > 0);
    }
  } else if (sortBy === 'avg3') {
    filtered = filtered.filter(p => (p.player_stats?.[0]?.avg3 ?? 0) > 0);
  }

  return filtered;
}

/** Inputs for sorting the players list. */
export interface SortOpts {
  sortBy: SortOption;
  sortAscending: boolean;
  weeklyPriceMap: Record<number, number>;
  fwBreakevenById: Record<number, number>;
  roundScoresById: Record<number, PlayerRoundScores>;
  scoreRound: number;
}

export function applyPlayerSort(players: Player[], opts: SortOpts): Player[] {
  const {
    sortBy, sortAscending, weeklyPriceMap,
    fwBreakevenById, roundScoresById, scoreRound,
  } = opts;

  const getRoundScore = (id: number) =>
    scoreRound > 0
      ? (roundScoresById[id]?.roundScores?.[scoreRound] ?? 0)
      : (roundScoresById[id]?.lastScore ?? 0);

  return [...players].sort((a, b) => {
    const sa = a.player_stats?.[0];
    const sb = b.player_stats?.[0];
    if (!sa || !sb) return 0;
    let diff = 0;
    switch (sortBy) {
      case 'avg':    diff = (sb.avg ?? 0) - (sa.avg ?? 0); break;
      case 'avg3':   diff = (sb.avg3 ?? 0) - (sa.avg3 ?? 0); break;
      case 'avg5': {
        const a5 = roundScoresById[a.id]?.avg5 ?? 0;
        const b5 = roundScoresById[b.id]?.avg5 ?? 0;
        diff = b5 - a5;
        break;
      }
      case 'price':  diff = (sb.price ?? 0) - (sa.price ?? 0); break;
      case 'price_change': {
        const aChange = weeklyPriceMap[a.id] ?? sa.price_change ?? 0;
        const bChange = weeklyPriceMap[b.id] ?? sb.price_change ?? 0;
        diff = bChange - aChange;
        break;
      }
      case 'points': {
        diff = getRoundScore(b.id) - getRoundScore(a.id);
        break;
      }
      case 'total_pts': {
        diff = (sb.total_points ?? 0) - (sa.total_points ?? 0);
        break;
      }
      case 'ppts': {
        // Nulls sort to the end regardless of direction — players without a
        // BE shouldn't stomp the top of the list.
        const abe = fwBreakevenById[a.id] ?? sa.ppts ?? null;
        const bbe = fwBreakevenById[b.id] ?? sb.ppts ?? null;
        if (abe === null && bbe === null) { diff = 0; break; }
        if (abe === null) { diff = 1; break; }
        if (bbe === null) { diff = -1; break; }
        diff = bbe - abe;
        break;
      }
      default: diff = 0;
    }
    return sortAscending ? -diff : diff;
  });
}
