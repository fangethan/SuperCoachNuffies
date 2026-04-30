export interface Team {
  id: number;
  abbrev: string;
  name: string;
}

export interface Venue {
  id: number;
  name: string;
  display_name: string;
  short_name: string;
  abbrev: string;
}

export interface Position {
  position: 'DEF' | 'MID' | 'FWD' | 'RUC';
  position_long: string;
  sort: number;
}

export interface PositionRank {
  pos_rank: string;
  pos_rd_rank: string;
  pos_rank_pos: string;
}

export interface PlayedStatus {
  status: 'pre' | 'live' | 'post';
  display: string;
}

export interface PlayerStats {
  player_id: number;
  round: number;

  // SuperCoach
  points: number;
  total_points: number;
  price: number;
  price_change: number;
  total_price_change: number;
  avg: number;
  avg3: number;
  avg5: number;
  ppts: number;   // breakeven
  ppts1: number;  // projected score
  owned: number;  // ownership %
  own_raw: number;

  // Ranking
  position: number;
  last_position: number;
  position_change: number;
  position_ranks: PositionRank[];

  // Time
  minutes_played: number;
  total_minutes_played: number;
  togp: number;
  total_togp: number;
  cba: number;
  total_cba: number;
  cbat: number;
  total_cbat: number;

  // Basic stats
  kicks: number;          total_kicks: number;
  handballs: number;      total_handballs: number;
  marks: number;          total_marks: number;
  tackles: number;        total_tackles: number;
  goals: number;          total_goals: number;
  behinds: number;        total_behinds: number;
  hitouts: number;        total_hitouts: number;
  freekicks_for: number;  total_freekicks_for: number;
  freekicks_against: number; total_freekicks_against: number;

  // SC scoring formula stats
  ek: number;   total_ek: number;
  ik: number;   total_ik: number;
  ck: number;   total_ck: number;
  kla: number;  total_kla: number;
  ehb: number;  total_ehb: number;
  ihb: number;  total_ihb: number;
  chb: number;  total_chb: number;
  hbr: number;  total_hbr: number;
  hbg: number;  total_hbg: number;
  lbg: number;  total_lbg: number;
  ga: number;   total_ga: number;
  ba: number;   total_ba: number;
  mu: number;   total_mu: number;
  mc: number;   total_mc: number;
  muo: number;  total_muo: number;
  mco: number;  total_mco: number;
  lm: number;   total_lm: number;
  ko: number;   total_ko: number;
  koc: number;  total_koc: number;
  sm: number;   total_sm: number;
  sp: number;   total_sp: number;
  hta: number;  total_hta: number;
  gfh: number;  total_gfh: number;
  tihs: number; total_tihs: number;
  buhs: number; total_buhs: number;
  cbhs: number; total_cbhs: number;

  // Matchup
  opp: Team | null;
  oppavg: number;
  opph: number;
  opp1: Team | null;   opp1h: number;
  opp2: Team | null;   opp2h: number;
  opp3: Team | null;   opp3h: number;

  // Venue
  ven: Venue | null;
  venavg: number;
  ven1: Venue | null;
  ven2: Venue | null;
  ven3: Venue | null;

  // Live
  livepts: number;
  livegames: number;

  // Other
  mvp_value: number;
  points_per_min: number | null;
  total_points_per_min: number;

  games: number;
  total_games: number;
  updated_at: string;
}

export interface Player {
  id: number;
  first_name: string;
  last_name: string;
  team_id: number;
  feed_id: string;
  hs_url: string | null;
  active: boolean;
  locked: boolean;
  injury_suspension_status: string | null;
  injury_suspension_status_text: string | null;
  played_status: PlayedStatus;
  previous_games: number;
  previous_average: number;
  previous_total: number;
  team: Team;
  positions: Position[];
  player_stats: PlayerStats[];
  notes: unknown[];
  odds: unknown[];
}

export interface SquiggleMatch {
  id: number;
  round: number;
  roundname: string;
  year: number;
  date: string;
  tz: string;
  hteam: string;
  ateam: string;
  hteamid: number;
  ateamid: number;
  venue: string;
  is_final: number;
  complete: number;
}

export interface SquiggleGame {
  games: SquiggleMatch[];
}

export type SortOption =
  | 'avg'
  | 'avg3'
  | 'avg5'
  | 'price'
  | 'price_change'
  | 'points'
  | 'owned'
  | 'ppts'
  | 'total_pts';

export type PositionFilter = 'ALL' | 'DEF' | 'MID' | 'FWD' | 'RUC';

export interface ScoreBreakdownItem {
  label: string;
  stat: string;
  count: number;
  points: number;
}

export interface StatCorrelation {
  stat: string;
  label: string;
  correlation: number;
  position: PositionFilter;
}
