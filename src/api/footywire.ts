import { Player, PlayerStats, Position, Team } from '../types';

// ─── Public types ────────────────────────────────────────────────────────────

export interface FootywirePlayer {
  breakeven: number;
  likelihood: number;
  injuryStatus: 'INJ' | 'SUS' | null;
  injuryDetail: string | null;
  returning: string | null;
}

export type FootywireMap = Record<string, FootywirePlayer>;

// ─── Team mapping ─────────────────────────────────────────────────────────────

const TEAM_MAP: Record<string, { name: string; abbrev: string; id: number }> = {
  'Adelaide':            { name: 'Adelaide',        abbrev: 'ADE', id: 1  },
  'Crows':               { name: 'Adelaide',        abbrev: 'ADE', id: 1  },
  'Brisbane':            { name: 'Brisbane',        abbrev: 'BRL', id: 2  },
  'Brisbane Lions':      { name: 'Brisbane',        abbrev: 'BRL', id: 2  },
  'Lions':               { name: 'Brisbane',        abbrev: 'BRL', id: 2  },
  'Carlton':             { name: 'Carlton',         abbrev: 'CAR', id: 3  },
  'Blues':               { name: 'Carlton',         abbrev: 'CAR', id: 3  },
  'Collingwood':         { name: 'Collingwood',     abbrev: 'COL', id: 4  },
  'Magpies':             { name: 'Collingwood',     abbrev: 'COL', id: 4  },
  'Essendon':            { name: 'Essendon',        abbrev: 'ESS', id: 5  },
  'Bombers':             { name: 'Essendon',        abbrev: 'ESS', id: 5  },
  'Fremantle':           { name: 'Fremantle',       abbrev: 'FRE', id: 6  },
  'Dockers':             { name: 'Fremantle',       abbrev: 'FRE', id: 6  },
  'Geelong':             { name: 'Geelong',         abbrev: 'GEE', id: 7  },
  'Cats':                { name: 'Geelong',         abbrev: 'GEE', id: 7  },
  'Gold Coast':          { name: 'Gold Coast',      abbrev: 'GCS', id: 8  },
  'Suns':                { name: 'Gold Coast',      abbrev: 'GCS', id: 8  },
  'GWS':                 { name: 'GWS Giants',      abbrev: 'GWS', id: 9  },
  'GWS Giants':          { name: 'GWS Giants',      abbrev: 'GWS', id: 9  },
  'Greater Western Sydney': { name: 'GWS Giants',   abbrev: 'GWS', id: 9  },
  'Giants':              { name: 'GWS Giants',      abbrev: 'GWS', id: 9  },
  'Hawthorn':            { name: 'Hawthorn',        abbrev: 'HAW', id: 10 },
  'Hawks':               { name: 'Hawthorn',        abbrev: 'HAW', id: 10 },
  'Melbourne':           { name: 'Melbourne',       abbrev: 'MEL', id: 11 },
  'Demons':              { name: 'Melbourne',       abbrev: 'MEL', id: 11 },
  'North Melbourne':     { name: 'North Melbourne', abbrev: 'NTH', id: 12 },
  'Kangaroos':           { name: 'North Melbourne', abbrev: 'NTH', id: 12 },
  'Port Adelaide':       { name: 'Port Adelaide',   abbrev: 'PTA', id: 13 },
  'Power':               { name: 'Port Adelaide',   abbrev: 'PTA', id: 13 },
  'Richmond':            { name: 'Richmond',        abbrev: 'RIC', id: 14 },
  'Tigers':              { name: 'Richmond',        abbrev: 'RIC', id: 14 },
  'St Kilda':            { name: 'St Kilda',        abbrev: 'STK', id: 15 },
  'Saints':              { name: 'St Kilda',        abbrev: 'STK', id: 15 },
  'Sydney':              { name: 'Sydney',          abbrev: 'SYD', id: 16 },
  'Swans':               { name: 'Sydney',          abbrev: 'SYD', id: 16 },
  'West Coast':          { name: 'West Coast',      abbrev: 'WCE', id: 17 },
  'Eagles':              { name: 'West Coast',      abbrev: 'WCE', id: 17 },
  'Western Bulldogs':    { name: 'Western Bulldogs', abbrev: 'WBD', id: 18 },
  'Bulldogs':            { name: 'Western Bulldogs', abbrev: 'WBD', id: 18 },
};

function resolveTeam(raw: string): Team {
  const t = TEAM_MAP[raw.trim()] ?? TEAM_MAP[raw.trim().split(' ').pop() ?? ''];
  return t
    ? { id: t.id, name: t.name, abbrev: t.abbrev }
    : { id: 0, name: raw.trim(), abbrev: raw.trim().slice(0, 3).toUpperCase() };
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function stableId(normName: string): number {
  let h = 5381;
  for (let i = 0; i < normName.length; i++) {
    h = (Math.imul(h, 33) ^ normName.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

// ─── HTML parsing helpers ─────────────────────────────────────────────────────

function extractCells(row: string): string[] {
  const cells: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(row)) !== null) {
    cells.push(m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
  }
  return cells;
}

function extractPlayerName(row: string): string | null {
  // Match any class attribute that CONTAINS "hiddenspan" (handles extra classes like "hiddenspan hidden")
  // Use [\s\S]*? so nested child elements don't block the match, then strip tags
  const hidden = row.match(/class="[^"]*hiddenspan[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  if (hidden?.[1]) {
    const text = hidden[1].replace(/<[^>]+>/g, '').trim();
    if (text) return text;
  }
  // Player profile link as fallback
  const link = row.match(/href="\/afl\/footy\/pu-[^"]*">([^<]+)<\/a>/i);
  if (link?.[1]?.trim()) return link[1].trim();
  return null;
}

function extractPositions(row: string): Position[] {
  // Footywire uses "FOR" for forwards on the scores page; map it to internal 'FWD'
  const found = [...new Set(
    [...row.matchAll(/\b(DEF|MID|FWD|FOR|RUC)\b/gi)]
      .map(m => {
        const p = m[1].toUpperCase();
        return (p === 'FOR' ? 'FWD' : p) as 'DEF' | 'MID' | 'FWD' | 'RUC';
      })
  )];
  if (found.length === 0) found.push('MID');
  const LONG: Record<string, string> = { DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward', RUC: 'Ruck' };
  return found.map((p, i) => ({ position: p, position_long: LONG[p] ?? p, sort: i }));
}

function parsePrice(s: string): number {
  const n = parseInt(s.replace(/[$,\s]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function parsePriceChange(s: string): number {
  const clean = s.replace(/[$,\s]/g, '');
  const n = parseInt(clean.replace(/[^0-9-]/g, ''), 10);
  if (isNaN(n)) return 0;
  return clean.startsWith('-') ? -Math.abs(n) : Math.abs(n);
}

function splitRows(html: string): string[] {
  if (html.includes('rowpid_')) {
    return html.split(/id="rowpid_\d+"/);
  }
  // General Footywire alternating-row pattern
  return html.split(/class="(?:dark|light)color"/);
}

// ─── Page parsers ─────────────────────────────────────────────────────────────

interface BreakevenFullRow {
  teamRaw: string; positions: Position[];
  price: number; games: number; avg: number;
  breakeven: number; likelihood: number;
}

// Footywire team URL slugs (used in pu-{team}--{player} URLs)
const FW_TEAM_SLUG: Record<string, string> = {
  'Adelaide':         'adelaide-crows',
  'Brisbane':         'brisbane-lions',
  'Carlton':          'carlton-blues',
  'Collingwood':      'collingwood-magpies',
  'Essendon':         'essendon-bombers',
  'Fremantle':        'fremantle-dockers',
  'Geelong':          'geelong-cats',
  'Gold Coast':       'gold-coast-suns',
  'GWS Giants':       'greater-western-sydney-giants',
  'Hawthorn':         'hawthorn-hawks',
  'Melbourne':        'melbourne-demons',
  'North Melbourne':  'north-melbourne-kangaroos',
  'Port Adelaide':    'port-adelaide-power',
  'Richmond':         'richmond-tigers',
  'St Kilda':         'st-kilda-saints',
  'Sydney':           'sydney-swans',
  'West Coast':       'west-coast-eagles',
  'Western Bulldogs': 'western-bulldogs',
};

// Known name differences between Footywire's BE page and pu- URL format
const FW_NAME_OVERRIDES: Record<string, string> = {
  'zach merrett': 'zachary merrett',
};

function buildPlayerSlug(teamName: string, fullName: string): string {
  const teamSlug = FW_TEAM_SLUG[teamName];
  if (!teamSlug) return '';
  const norm = fullName.toLowerCase();
  const resolved = FW_NAME_OVERRIDES[norm] ?? norm;
  const playerSlug = resolved
    .replace(/['''`]/g, '')       // remove apostrophes
    .replace(/[^a-z0-9\s-]/g, '') // remove other special chars (incl. periods)
    .replace(/\b[a-z]\b/g, '')    // strip single-letter middle initials
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return `pu-${teamSlug}--${playerSlug}`;
}
interface ScoresRow  { avg3: number; positions: Position[]; }
interface PricesRow  { price: number; totalChange: number; lastChange: number; }

// Detect price column by value > 100,000 — works whether or not $ prefix is present
function findPriceIdx(cells: string[]): number {
  return cells.findIndex(c => {
    const v = parseInt(c.replace(/[$,\s]/g, ''), 10);
    return !isNaN(v) && v > 100_000;
  });
}

// Breakeven page columns (hardcoded, proven working):
// Player | Team | Price | Games | Avg | Breakeven | Likelihood
function parseBreakevenFullPage(html: string): Record<string, BreakevenFullRow> {
  const result: Record<string, BreakevenFullRow> = {};
  if (!html) return result;
  const rows = html.split(/id="rowpid_\d+"/);
  for (const row of rows) {
    const nameMatch = row.match(/class="hiddenspan"[^>]*>([^<]+)<\/span>/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name) continue;
    const cells = extractCells(row);
    if (cells.length < 6) continue;
    const price      = parsePrice(cells[2] ?? '');
    const games      = parseInt(cells[3] ?? '0', 10);
    const avg        = parseFloat(cells[4] ?? '0');
    const breakeven  = parseInt(cells[5] ?? '0', 10);
    const likelihood = parseFloat((cells[6] ?? '').replace('%', ''));
    if (avg === 0 && breakeven === 0) continue;
    result[normaliseName(name)] = {
      teamRaw:    cells[1] ?? '',
      positions:  extractPositions(row),
      price:      isNaN(price)      ? 0 : price,
      games:      isNaN(games)      ? 0 : games,
      avg:        isNaN(avg)        ? 0 : avg,
      breakeven:  isNaN(breakeven)  ? 0 : breakeven,
      likelihood: isNaN(likelihood) ? 0 : likelihood,
    };
  }
  console.log(`[FW be-full] parsed ${Object.keys(result).length} players`);
  return result;
}

// Scores page columns (confirmed structure):
// cells[0]=Name+"\n"+Pos | cells[1]=Team | cells[2]=Price | cells[3]=Games |
// cells[4]=TotalPts | cells[5]=SeasonAvg | cells[6]=L3avg | ...
// Rows split by darkcolor/lightcolor — NOT rowpid_ (that's in nav UI only)
// cells[0] = "Name\nPos" (position abbreviation on the second line)
function parseScoresPage(html: string): Record<string, ScoresRow> {
  const result: Record<string, ScoresRow> = {};
  const rows = html.split(/class="(?:dark|light)color"/);
  for (const row of rows) {
    const cells = extractCells(row);
    if (cells.length < 7) continue;
    const parts = (cells[0] ?? '').split('\n');
    const name = parts[0]?.trim();
    if (!name || name.length < 3) continue;
    const priceIdx = findPriceIdx(cells);
    if (priceIdx < 0 || priceIdx + 4 >= cells.length) continue;
    const avg3 = parseFloat(cells[priceIdx + 4] ?? '0');
    if (isNaN(avg3) || avg3 <= 0) continue;
    // Position is on the second line of the name cell, e.g. "FWD" or "MID/FWD"
    const posText = (parts[1] ?? '').trim();
    const positions = extractPositions(posText || row);
    if (Object.keys(result).length < 5) {
      console.log(`[FW pos DEBUG] name="${name}" posText="${posText}" cells[0]=${JSON.stringify(cells[0]?.slice(0, 60))}`);
    }
    result[normaliseName(name)] = { avg3, positions };
  }
  console.log(`[FW scores] parsed ${Object.keys(result).length} players`);
  return result;
}

function parsePricesPage(html: string): Record<string, PricesRow> {
  const result: Record<string, PricesRow> = {};
  const rows = splitRows(html);
  for (const row of rows) {
    const name = extractPlayerName(row);
    if (!name) continue;
    const cells = extractCells(row);
    // Columns: Player | Current | Total Change | Change% | Last Change | ...
    const priceIdx = cells.findIndex(c => c.startsWith('$'));
    if (priceIdx < 0) continue;
    const price       = parsePrice(cells[priceIdx]);
    const totalChange = parsePriceChange(cells[priceIdx + 1] ?? '0');
    const lastChange  = parsePriceChange(cells[priceIdx + 3] ?? '0');
    if (price === 0) continue;
    result[normaliseName(name)] = { price, totalChange, lastChange };
  }
  console.log(`[FW prices] parsed ${Object.keys(result).length} players`);
  return result;
}

// Player profile page (pu-{team}--{player}?year=Y)
// Table columns: Round | Price | SC Score | Value
// Validates price > 100k to skip nav/header rows, then extracts scored rounds
function parsePlayerRoundPage(html: string): Map<number, number> {
  const scores = new Map<number, number>();
  if (!html) return scores;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  let seenRound1 = false;
  while ((m = rowRe.exec(html)) !== null) {
    const cells = extractCells(m[1]);
    if (cells.length < 3) continue;
    const round = parseInt(cells[0], 10);
    if (isNaN(round) || round < 1 || round > 30) continue;
    const price = parseInt((cells[1] ?? '').replace(/[$,\s]/g, ''), 10);
    if (isNaN(price) || price < 100_000) continue;
    // Round 1 appearing a second time means we've hit the previous year's section
    if (round === 1) {
      if (seenRound1) break;
      seenRound1 = true;
    }
    const scoreStr = (cells[2] ?? '').trim();
    if (!scoreStr || scoreStr === '--' || scoreStr === 'DNP') continue;
    const score = parseInt(scoreStr, 10);
    if (!isNaN(score) && score >= 0) scores.set(round, score);
  }
  return scores;
}

// ─── Injury / breakeven parsers (existing) ────────────────────────────────────

function parseBreakevenPage(html: string): Record<string, { breakeven: number; likelihood: number }> {
  const result: Record<string, { breakeven: number; likelihood: number }> = {};
  if (!html) return result;
  const rows = html.split(/id="rowpid_\d+"/);
  for (const row of rows) {
    const nameMatch = row.match(/class="hiddenspan"[^>]*>([^<]+)<\/span>/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name) continue;
    const cells = extractCells(row);
    if (cells.length < 6) continue;
    const breakeven  = parseInt(cells[5], 10);
    const likelihood = parseFloat((cells[6] ?? '').replace('%', ''));
    result[normaliseName(name)] = {
      breakeven:  isNaN(breakeven)  ? 0 : breakeven,
      likelihood: isNaN(likelihood) ? 0 : likelihood,
    };
  }
  return result;
}

interface InjuryEntry { status: 'INJ' | 'SUS'; detail: string; returning: string; }

function parseInjuryListPage(html: string): Record<string, InjuryEntry> {
  const result: Record<string, InjuryEntry> = {};
  if (!html) return result;
  const rowRe = /<tr[^>]+class="(?:dark|light)color"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const nameMatch = row.match(/rel="nofollow"[^>]*>([^<]+)<\/a>/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const cells: string[] = [];
    const tdRe = /<td[^>]*>([^<]*)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(row)) !== null) {
      cells.push(tdMatch[1].replace(/&nbsp;/g, '').trim());
    }
    const detail    = cells[0] ?? '';
    const returning = cells[1] ?? '';
    const status: 'INJ' | 'SUS' = detail === 'Suspended' ? 'SUS' : 'INJ';
    result[normaliseName(name)] = { status, detail, returning };
  }
  return result;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function getText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FW fetch failed ${res.status}: ${url}`);
  const html = String((await res.text()) || '');
  return html;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Retry up to `attempts` times with exponential back-off (1 s, 2 s, …)
async function fetchWithRetry(url: string, attempts = 3): Promise<string> {
  for (let a = 0; a < attempts; a++) {
    try {
      return await getText(url);
    } catch {
      if (a < attempts - 1) await sleep(1000 * (a + 1));
    }
  }
  return '';
}

// ─── Breakeven map (for existing usage in hooks) ──────────────────────────────

async function fetchBreakevenMap(): Promise<FootywireMap> {
  const [injHtml, beHtml] = await Promise.all([
    getText('https://www.footywire.com/afl/footy/injury_list'),
    getText('https://www.footywire.com/afl/footy/supercoach_breakevens'),
  ]);

  const beData  = parseBreakevenPage(beHtml);
  const injData = parseInjuryListPage(injHtml);

  const merged: FootywireMap = {};
  for (const [key, be] of Object.entries(beData)) {
    const inj = injData[key];
    merged[key] = { ...be, injuryStatus: inj?.status ?? null, injuryDetail: inj?.detail ?? null, returning: inj?.returning ?? null };
  }
  for (const [key, inj] of Object.entries(injData)) {
    if (!merged[key]) {
      merged[key] = { breakeven: 0, likelihood: 0, injuryStatus: inj.status, injuryDetail: inj.detail, returning: inj.returning };
    }
  }
  console.log(`[FW BE map] ${Object.keys(merged).length} entries`);
  return merged;
}

// ─── Main player aggregator ───────────────────────────────────────────────────

async function fetchAllPlayers(year: number, round: number): Promise<Player[]> {
  // Phase 1: aggregate pages (run in parallel)
  const [beHtml, scoresHtml, pricesHtml, injHtml] = await Promise.all([
    getText(`https://www.footywire.com/afl/footy/supercoach_breakevens?year=${year}`),
    getText(`https://www.footywire.com/afl/footy/supercoach_scores?year=${year}`),
    getText(`https://www.footywire.com/afl/footy/supercoach_prices?year=${year}`),
    getText('https://www.footywire.com/afl/footy/injury_list'),
  ]);

  const beData     = parseBreakevenFullPage(beHtml);
  const scoresData = parseScoresPage(scoresHtml);
  const pricesData = parsePricesPage(pricesHtml);
  const injData    = parseInjuryListPage(injHtml);

  const players: Player[] = [];

  for (const [normName, be] of Object.entries(beData)) {
    const scores = scoresData[normName];
    const prices = pricesData[normName];
    const inj    = injData[normName];

    const { firstName, lastName } = splitName(
      normName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    );

    const team = resolveTeam(be.teamRaw);
    const id   = stableId(normName);

    const avg3 = scores?.avg3 ?? 0;
    const lastScore = 0;
    const avg5 = 0;

    const stats: PlayerStats = {
      player_id: id,
      round,

      points:             lastScore,
      total_points:       0,
      price:              prices?.price       ?? be.price,
      price_change:       prices?.lastChange  ?? 0,
      total_price_change: prices?.totalChange ?? 0,
      avg:                be.avg,
      avg3,
      avg5,
      ppts:               be.breakeven,
      ppts1:              0,
      owned:              0,
      own_raw:            0,
      games:              be.games,

      position: 0, last_position: 0, position_change: 0, position_ranks: [],

      minutes_played: 0, total_minutes_played: 0,
      togp: 0, total_togp: 0,
      cba: 0, total_cba: 0, cbat: 0, total_cbat: 0,

      kicks: 0, total_kicks: 0,
      handballs: 0, total_handballs: 0,
      marks: 0, total_marks: 0,
      tackles: 0, total_tackles: 0,
      goals: 0, total_goals: 0,
      behinds: 0, total_behinds: 0,
      hitouts: 0, total_hitouts: 0,
      freekicks_for: 0, total_freekicks_for: 0,
      freekicks_against: 0, total_freekicks_against: 0,

      ek: 0, total_ek: 0, ik: 0, total_ik: 0, ck: 0, total_ck: 0,
      kla: 0, total_kla: 0, ehb: 0, total_ehb: 0, ihb: 0, total_ihb: 0,
      chb: 0, total_chb: 0, hbr: 0, total_hbr: 0, hbg: 0, total_hbg: 0,
      lbg: 0, total_lbg: 0, ga: 0, total_ga: 0, ba: 0, total_ba: 0,
      mu: 0, total_mu: 0, mc: 0, total_mc: 0, muo: 0, total_muo: 0,
      mco: 0, total_mco: 0, lm: 0, total_lm: 0, ko: 0, total_ko: 0,
      koc: 0, total_koc: 0, sm: 0, total_sm: 0, sp: 0, total_sp: 0,
      hta: 0, total_hta: 0, gfh: 0, total_gfh: 0,
      tihs: 0, total_tihs: 0, buhs: 0, total_buhs: 0, cbhs: 0, total_cbhs: 0,

      opp: null, oppavg: 0, opph: 0,
      opp1: null, opp1h: 0, opp2: null, opp2h: 0, opp3: null, opp3h: 0,
      ven: null, venavg: 0,
      ven1: null, ven2: null, ven3: null,

      livepts: 0, livegames: 0,

      mvp_value: 0, points_per_min: null, total_points_per_min: 0,
      total_games: be.games,
      updated_at: new Date().toISOString(),
    };

    const player: Player = {
      id,
      first_name: firstName,
      last_name:  lastName,
      team_id:    team.id,
      feed_id:    String(id),
      hs_url:     null,
      active:     inj?.status !== 'SUS',
      locked:     false,
      injury_suspension_status:      inj?.status  ?? null,
      injury_suspension_status_text: inj?.detail  ?? null,
      played_status: { status: 'post', display: 'Final' },
      previous_games:   0,
      previous_average: 0,
      previous_total:   0,
      team,
      positions:    scores?.positions ?? be.positions,
      player_stats: [stats],
      notes: [],
      odds:  [],
    };

    players.push(player);
  }

  console.log(`[FW aggregate] ${players.length} players built for round ${round}`);
  return players;
}

// ─── Bulk round scores (supercoach_round page) ───────────────────────────────

export interface PlayerRoundScores { avg5: number; lastScore: number; }

// Parse supercoach_round?year=Y&round=R — returns all players' SC score for that round
//
// Confirmed column layout (from debug output):
//   cells[0] = Rank  |  cells[1] = Name  |  cells[2] = Team
//   cells[3] = Current price  |  cells[4] = Prev price
//   cells[5] = Round score  |  cells[6] = Ownership %
//
// Top-ranked players may use a non-alternating CSS class, so we match ALL <tr>
// instead of relying on splitRows (which only finds darkcolor/lightcolor rows).
function parseRoundScoresPage(html: string): Record<string, number> {
  const result: Record<string, number> = {};
  if (!html) return result;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const cells = extractCells(m[1]);
    if (cells.length < 7) continue;
    // cells[0] is rank (a number) — skip rows where it isn't a small integer
    const rank = parseInt(cells[0] ?? '', 10);
    if (isNaN(rank) || rank < 1 || rank > 900) continue;
    // Name is in cells[1]; strip any status suffix after newline (e.g. "James Sicily\n Suspended")
    const name = (cells[1] ?? '').split('\n')[0].trim();
    if (!name || name.length < 3) continue;
    // Validate cells[3] is the current price (>100k) — guards against header/ad rows
    const price = parseInt((cells[3] ?? '').replace(/[$,\s]/g, ''), 10);
    if (isNaN(price) || price < 100_000) continue;
    // Round score is in cells[5]
    const scoreRaw = (cells[5] ?? '').trim();
    if (!/^\d+$/.test(scoreRaw)) continue;
    const score = parseInt(scoreRaw, 10);
    if (score < 0 || score > 350) continue;
    result[normaliseName(name)] = score;
  }
  console.log(`[FW round] parsed ${Object.keys(result).length} players`);
  return result;
}

// Fetch ALL completed rounds in parallel (1 request per round, not 800 per player).
// We need rounds 1..N because L5 = last 5 rounds a player actually played — a player
// who DNP rounds 5-7 has their L5 in rounds 1-4, which we'd miss with a sliding window.
async function fetchRoundScoresBulk(
  year: number,
  lastCompleteRound: number,
  players: Player[],
): Promise<Record<number, PlayerRoundScores>> {
  // Start from round 0 (AFL opening round) — many players score there and it counts
  // toward L5 and season avg. Players who didn't play round 0 simply won't appear on
  // that page, so they're unaffected.
  const rounds = Array.from({ length: lastCompleteRound + 1 }, (_, i) => i);

  const roundHtmls = await Promise.all(
    rounds.map(r =>
      fetchWithRetry(`https://www.footywire.com/afl/footy/supercoach_round?year=${year}&round=${r}&p=&s=T`)
    )
  );

  // Parse each round page into normName → score
  const roundScoreMaps = roundHtmls.map(html => (html ? parseRoundScoresPage(html) : {}));

  const output: Record<number, PlayerRoundScores> = {};
  for (const player of players) {
    const norm = normaliseName(`${player.first_name} ${player.last_name}`);
    // Collect in most-recent-first order
    const scores: number[] = [];
    for (let i = roundScoreMaps.length - 1; i >= 0; i--) {
      const score = roundScoreMaps[i][norm];
      if (score !== undefined && score > 0) scores.push(score);
    }
    output[player.id] = {
      lastScore: scores[0] ?? 0,
      avg5: scores.length > 0
        ? scores.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(scores.length, 5)
        : 0,
    };
  }

  console.log(`[FW bulk] rounds 0–${lastCompleteRound} → ${Object.keys(output).length} players`);
  return output;
}

// ─── Legacy individual-page fetcher (kept for reference) ─────────────────────

async function fetchAllPlayerRoundScores(year: number, players: Player[]): Promise<Record<number, PlayerRoundScores>> {
  // Step 1: get authoritative pu- slugs straight from the BE page (1 request).
  // Each row already has href="pu-team--player" — no slug building, no guessing.
  const slugByNorm = new Map<string, string>();
  try {
    const beHtml = await getText(`https://www.footywire.com/afl/footy/supercoach_breakevens?year=${year}`);
    for (const row of beHtml.split(/id="rowpid_\d+"/)) {
      const nameMatch = row.match(/class="hiddenspan"[^>]*>([^<]+)<\/span>/i);
      const slugMatch = row.match(/href="(pu-[^"]+)"/i);
      if (nameMatch?.[1] && slugMatch?.[1]) {
        slugByNorm.set(normaliseName(nameMatch[1].trim()), slugMatch[1].trim());
      }
    }
  } catch { /* fall through — will use buildPlayerSlug fallback below */ }

  // Step 2: map every player to its slug (BE page slug wins; built slug is fallback)
  const slugEntries = players
    .map(p => {
      const norm = normaliseName(`${p.first_name} ${p.last_name}`);
      const slug = slugByNorm.get(norm)
        ?? buildPlayerSlug(p.team.name, `${p.first_name} ${p.last_name}`);
      return { id: p.id, slug };
    })
    .filter(e => e.slug.length > 0);

  // Step 3: fetch individual player pages — 25 concurrent at a time.
  // No inter-batch delay needed (25 concurrent is well within Footywire's limits);
  // the retry logic handles any transient rejections.
  const BATCH = 25;
  const roundMaps: Map<number, number>[] = new Array(slugEntries.length);
  for (let i = 0; i < slugEntries.length; i += BATCH) {
    const batch = slugEntries.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(({ slug }) =>
        fetchWithRetry(`https://www.footywire.com/afl/footy/${slug}?year=${year}`)
          .then(html => html ? parsePlayerRoundPage(html) : new Map<number, number>())
          .catch(() => new Map<number, number>())
      )
    );
    batchResults.forEach((r, j) => {
      roundMaps[i + j] = r.status === 'fulfilled' ? r.value : new Map();
    });
  }

  const output: Record<number, PlayerRoundScores> = {};
  slugEntries.forEach(({ id }, i) => {
    const roundMap = roundMaps[i] ?? new Map<number, number>();
    const sorted = Array.from(roundMap.entries()).sort(([a], [b]) => b - a).map(([, s]) => s);
    output[id] = {
      lastScore: sorted[0] ?? 0,
      avg5: sorted.length > 0 ? sorted.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(sorted.length, 5) : 0,
    };
  });
  return output;
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

function lookupByNorm(map: FootywireMap, normName: string): FootywirePlayer | undefined {
  if (map[normName]) return map[normName];
  const parts = normName.split(' ');
  if (parts.length < 2) return undefined;
  const last  = parts[parts.length - 1];
  const first = parts[0][0];
  for (const key of Object.keys(map)) {
    const kp = key.split(' ');
    if (kp.length < 2) continue;
    if (kp[kp.length - 1] === last && kp[0][0] === first) return map[key];
  }
  return undefined;
}

function lookupPlayer(map: FootywireMap, firstName: string, lastName: string): FootywirePlayer | undefined {
  return lookupByNorm(map, normaliseName(`${firstName} ${lastName}`));
}

export const footywireApi = { fetchBreakevenMap, fetchAllPlayers, fetchRoundScoresBulk, fetchAllPlayerRoundScores, normaliseName, lookupPlayer };
