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

  scAuthToken: null,
  setScAuthToken: (token) => set({ scAuthToken: token }),
}));
