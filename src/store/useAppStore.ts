import { create } from 'zustand';
import { Player, PositionFilter, SortOption } from '../types';
import { CURRENT_ROUND, CURRENT_YEAR } from '../constants';

interface AppState {
  // Round / year
  currentRound: number;
  maxRound: number;        // detected live round — upper bound for the round picker
  currentYear: number;
  setCurrentRound: (round: number) => void;
  setMaxRound: (round: number) => void;

  // Filters
  positionFilter: PositionFilter;
  setPositionFilter: (pos: PositionFilter) => void;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  sortAscending: boolean;
  setSortAscending: (v: boolean) => void;
  toggleSortDirection: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // My team (personal tracking)
  myTeamIds: number[];
  setMyTeamIds: (ids: number[]) => void;
  addToMyTeam: (id: number) => void;
  removeFromMyTeam: (id: number) => void;

  // Owned filter
  showOwnedOnly: boolean;
  setShowOwnedOnly: (v: boolean) => void;

  // "On the bubble" filter — players with ≤2 games played
  showBubbleOnly: boolean;
  setShowBubbleOnly: (v: boolean) => void;

  // Season year picker (UI only for now — 2024/2025/2026)
  selectedYear: number;
  setSelectedYear: (year: number) => void;

  // Price range filter
  priceMin: number;
  priceMax: number;
  setPriceMin: (v: number) => void;
  setPriceMax: (v: number) => void;

  // Bye round filter — exclude players with a bye in any selected round
  byeRoundFilters: number[];
  toggleByeRoundFilter: (r: number) => void;

  // Reset all filters to defaults
  resetFilters: () => void;

  // Auth token for SuperCoach personal features
  scAuthToken: string | null;
  setScAuthToken: (token: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRound: CURRENT_ROUND,
  maxRound: CURRENT_ROUND,
  currentYear: CURRENT_YEAR,
  setCurrentRound: (round) => set({ currentRound: round }),
  setMaxRound: (round) => set({ maxRound: round }),

  positionFilter: 'ALL',
  setPositionFilter: (pos) => set({ positionFilter: pos }),
  sortBy: 'total_pts',
  setSortBy: (sort) => set({ sortBy: sort, sortAscending: false }),
  sortAscending: false,
  setSortAscending: (v) => set({ sortAscending: v }),
  toggleSortDirection: () => set(s => ({ sortAscending: !s.sortAscending })),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  myTeamIds: [],
  setMyTeamIds: (ids) => set({ myTeamIds: ids }),
  addToMyTeam: (id) => set(state => ({
    myTeamIds: state.myTeamIds.includes(id)
      ? state.myTeamIds
      : [...state.myTeamIds, id],
  })),
  removeFromMyTeam: (id) => set(state => ({
    myTeamIds: state.myTeamIds.filter(i => i !== id),
  })),

  showOwnedOnly: false,
  setShowOwnedOnly: (v) => set({ showOwnedOnly: v }),

  showBubbleOnly: false,
  setShowBubbleOnly: (v) => set({ showBubbleOnly: v }),

  selectedYear: CURRENT_YEAR,
  setSelectedYear: (year) => set({ selectedYear: year }),

  priceMin: 95.0,
  priceMax: 750.0,
  setPriceMin: (v) => set({ priceMin: v }),
  setPriceMax: (v) => set({ priceMax: v }),

  byeRoundFilters: [],
  toggleByeRoundFilter: (r) => set(s => ({
    byeRoundFilters: s.byeRoundFilters.includes(r)
      ? s.byeRoundFilters.filter(x => x !== r)
      : [...s.byeRoundFilters, r],
  })),

  resetFilters: () => set({
    positionFilter: 'ALL',
    sortBy: 'total_pts',
    sortAscending: false,
    searchQuery: '',
    showOwnedOnly: false,
    showBubbleOnly: false,
    priceMin: 95.0,
    priceMax: 750.0,
    byeRoundFilters: [],
  }),

  scAuthToken: null,
  setScAuthToken: (token) => set({ scAuthToken: token }),
}));
