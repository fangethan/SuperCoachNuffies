import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Player, PositionFilter, SortOption } from '../types';
import { CURRENT_ROUND, CURRENT_YEAR } from '../constants';

const STORAGE_TEAM_IDS  = 'my_team_ids_v1';
const STORAGE_BENCH_IDS = 'my_bench_ids_v1';
const STORAGE_SC_TOKEN  = 'sc_auth_token_v1';
const STORAGE_SC_POS    = 'my_team_sc_pos_v1';
const STORAGE_EMG_IDS   = 'my_team_emg_v1';

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

  // Bench player IDs (subset of myTeamIds)
  myBenchIds: number[];
  setMyBenchIds: (ids: number[]) => void;

  // SC-assigned positions for each player (player id → 'DEF'|'MID'|'RUC'|'FWD'|'FLEX')
  myTeamScPositions: Record<number, string>;
  setMyTeamScPositions: (m: Record<number, string>) => void;

  // Bench players nominated as Emergency in SC
  myTeamEmgIds: number[];
  setMyTeamEmgIds: (ids: number[]) => void;

  // Captain / Vice-Captain selections (user-set, not persisted)
  captainId: number | null;
  vcId: number | null;
  setCaptainId: (id: number | null) => void;
  setVcId: (id: number | null) => void;

  // Trades remaining from SC API
  scTradesLeft: number | null;
  setScTradesLeft: (n: number | null) => void;

  // Auth token for SuperCoach personal features
  scAuthToken: string | null;
  setScAuthToken: (token: string | null) => void;

  // Hydrate persisted team state from AsyncStorage on cold start
  hydrateFromStorage: () => Promise<void>;
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
  setMyTeamIds: (ids) => {
    set({ myTeamIds: ids });
    AsyncStorage.setItem(STORAGE_TEAM_IDS, JSON.stringify(ids)).catch(() => {});
  },
  addToMyTeam: (id) => set(state => {
    const next = state.myTeamIds.includes(id) ? state.myTeamIds : [...state.myTeamIds, id];
    AsyncStorage.setItem(STORAGE_TEAM_IDS, JSON.stringify(next)).catch(() => {});
    return { myTeamIds: next };
  }),
  removeFromMyTeam: (id) => set(state => {
    const next = state.myTeamIds.filter(i => i !== id);
    AsyncStorage.setItem(STORAGE_TEAM_IDS, JSON.stringify(next)).catch(() => {});
    return { myTeamIds: next };
  }),

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

  myBenchIds: [],
  setMyBenchIds: (ids) => {
    set({ myBenchIds: ids });
    AsyncStorage.setItem(STORAGE_BENCH_IDS, JSON.stringify(ids)).catch(() => {});
  },

  myTeamScPositions: {},
  setMyTeamScPositions: (m) => {
    set({ myTeamScPositions: m });
    AsyncStorage.setItem(STORAGE_SC_POS, JSON.stringify(m)).catch(() => {});
  },

  myTeamEmgIds: [],
  setMyTeamEmgIds: (ids) => {
    set({ myTeamEmgIds: ids });
    AsyncStorage.setItem(STORAGE_EMG_IDS, JSON.stringify(ids)).catch(() => {});
  },

  captainId: null,
  vcId: null,
  setCaptainId: (id) => set({ captainId: id && id > 0 ? id : null }),
  setVcId: (id) => set({ vcId: id && id > 0 ? id : null }),

  scTradesLeft: null,
  setScTradesLeft: (n) => set({ scTradesLeft: n }),

  scAuthToken: null,
  setScAuthToken: (token) => {
    set({ scAuthToken: token });
    if (token) {
      AsyncStorage.setItem(STORAGE_SC_TOKEN, token).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_SC_TOKEN).catch(() => {});
      AsyncStorage.removeItem(STORAGE_TEAM_IDS).catch(() => {});
      AsyncStorage.removeItem(STORAGE_BENCH_IDS).catch(() => {});
      AsyncStorage.removeItem(STORAGE_SC_POS).catch(() => {});
      AsyncStorage.removeItem(STORAGE_EMG_IDS).catch(() => {});
      set({ myBenchIds: [], scTradesLeft: null, myTeamScPositions: {}, myTeamEmgIds: [] });
    }
  },

  hydrateFromStorage: async () => {
    try {
      const [tokenRaw, idsRaw, benchRaw, scPosRaw, emgRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_SC_TOKEN),
        AsyncStorage.getItem(STORAGE_TEAM_IDS),
        AsyncStorage.getItem(STORAGE_BENCH_IDS),
        AsyncStorage.getItem(STORAGE_SC_POS),
        AsyncStorage.getItem(STORAGE_EMG_IDS),
      ]);
      if (tokenRaw) set({ scAuthToken: tokenRaw });
      if (idsRaw) {
        const ids = JSON.parse(idsRaw);
        if (Array.isArray(ids) && ids.length > 0) set({ myTeamIds: ids });
      }
      if (benchRaw) {
        const ids = JSON.parse(benchRaw);
        if (Array.isArray(ids)) set({ myBenchIds: ids });
      }
      if (scPosRaw) {
        const m = JSON.parse(scPosRaw);
        if (m && typeof m === 'object') set({ myTeamScPositions: m });
      }
      if (emgRaw) {
        const ids = JSON.parse(emgRaw);
        if (Array.isArray(ids)) set({ myTeamEmgIds: ids });
      }
    } catch { /* ignore */ }
  },
}));
