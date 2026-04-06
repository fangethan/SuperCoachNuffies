import { create } from 'zustand';
import { Player, PositionFilter, SortOption } from '../types';
import { CURRENT_ROUND, CURRENT_YEAR } from '../constants';

interface AppState {
  // Round / year
  currentRound: number;
  currentYear: number;
  setCurrentRound: (round: number) => void;

  // Filters
  positionFilter: PositionFilter;
  setPositionFilter: (pos: PositionFilter) => void;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // My team (personal tracking)
  myTeamIds: number[];
  setMyTeamIds: (ids: number[]) => void;
  addToMyTeam: (id: number) => void;
  removeFromMyTeam: (id: number) => void;

  // Auth token for SuperCoach personal features
  scAuthToken: string | null;
  setScAuthToken: (token: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRound: CURRENT_ROUND,
  currentYear: CURRENT_YEAR,
  setCurrentRound: (round) => set({ currentRound: round }),

  positionFilter: 'ALL',
  setPositionFilter: (pos) => set({ positionFilter: pos }),
  sortBy: 'avg',
  setSortBy: (sort) => set({ sortBy: sort }),
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

  scAuthToken: null,
  setScAuthToken: (token) => set({ scAuthToken: token }),
}));
