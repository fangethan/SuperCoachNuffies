import { Player, PlayerStats, Position, Team } from '../types';
import { getEntry, getJson, setJson } from '../store/cache';
import { CURRENT_YEAR } from '../constants';
import { deriveBEMap, splitBEMap, RoundDataRow } from '../utils/beDerivation';

// Bumped to "be7:" after fixing the second-scored-round BE.
//
// SC's "on the bubble" rule: a player's price doesn't change until they've
// played 3 matches. Price progression for the first three scored rounds:
//   start of R0: starting price       (0 games played)
//   start of R1: starting price       (1 game played — frozen)
//   start of R2: starting price       (2 games played — frozen)
//   start of R3: first changed price  (3 games played — unfreeze)
//
// So priceChange at R0 = priceChange at R1 = 0 → priceChange-derived BE
// collapses. We use SC's bubble BE formula instead:
//
//   BE_R = 3 × proj_avg − S_{R-1} − S_{R-2}
//
// where proj_avg = price / 5000 (SC's starting-price → projected-average
// convention) and missing prior rounds are filled in with proj_avg. That
// gives:
//   BE_R0 = 3·proj − proj − proj = proj_avg                  (no real priors)
//   BE_R1 = 3·proj − S_R0 − proj = 2·proj_avg − S_R0         (1 real prior)
//   BE_R2 = 3·proj − S_R1 − S_R0                             (2 real priors)
//
// Verified against Liam Henry (proj 32, scored 88 R8) → BE_R9 = 2·32−88
// = −24 (SC published −22, ~rounding of proj_avg). And against Grundy
// (proj ≈135) → BE_R0 = 135, BE_R1 = 2·135−117 = 153.
//
// For R2 the bubble formula and the priceChange formula AGREE numerically
// (verified Grundy: R3 price drop $24,400 ⇒ BE_R2 = S_R2+54 ≈ 199 = bubble
// formula's 3·135−89−117). So we only need the bubble fallback at indices
// 0 and 1; R2 onwards the existing priceChange-based code recovers the
// correct number.
// The BE map is split into two SQLite rows per (player, year):
//
//   be7p:{slug}_{year}   — frozen rounds (round ≤ lastScored). Permanent,
//                          never expires. Past-season data lives entirely
//                          here. Only refreshed if the file doesn't exist.
//   be7:{slug}_{year}    — the live row, only the upcoming round's BE
//                          (currentBE). TTL'd because Footywire updates it
//                          daily as injuries/projections shift.
//
// Splitting like this means a stale live row triggers exactly one refetch
// path (live), and the frozen half is reused without going to the network.
// For a closed season (year != CURRENT_YEAR) we never write a live row.
const PLAYER_BE_KEY_PREFIX_FROZEN = 'be8p:';
const PLAYER_BE_KEY_PREFIX_LIVE   = 'be8:';
const PLAYER_BE_TTL = 1000 * 60 * 60 * 6; // 6 hours, applies only to the live half

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
  return name.toLowerCase().replace(/-/g, ' ').replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
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
interface ScoresRow  { avg3: number; totalPoints: number; positions: Position[]; }
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
    const totalPoints = parseInt(cells[priceIdx + 2] ?? '0', 10);
    const avg3 = parseFloat(cells[priceIdx + 4] ?? '0');
    if (isNaN(avg3) || avg3 <= 0) continue;
    const posText = (parts[1] ?? '').trim();
    const positions = extractPositions(posText || row);
    if (Object.keys(result).length < 5) {
      console.log(`[FW pos DEBUG] name="${name}" posText="${posText}" cells[0]=${JSON.stringify(cells[0]?.slice(0, 60))}`);
    }
    result[normaliseName(name)] = { avg3, totalPoints: isNaN(totalPoints) ? 0 : totalPoints, positions };
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

// Player profile page (pu-{team}--{player})
// The page contains ALL historical years. Year sections are detected when the round
// number resets (goes backward), e.g. ...7 → 1 means the 2025 section just started.
// Returns Record<year, Map<round, score>>.
function parsePlayerAllYearsPage(html: string, latestYear: number): Record<number, Map<number, number>> {
  const result: Record<number, Map<number, number>> = {};
  if (!html) return result;

  let year = latestYear;
  let prevRound = -1;

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const cells = extractCells(m[1]);
    if (cells.length < 3) continue;
    const round = parseInt(cells[0], 10);
    // Allow round 0 (AFL Opening Round) — it counts toward avgs
    if (isNaN(round) || round < 0 || round > 30) continue;
    const price = parseInt((cells[1] ?? '').replace(/[$,\s]/g, ''), 10);
    // Floor: SC's minimum player price is $99,100. The threshold must sit
    // below that or we silently drop every rookie's bubble rounds (R1/R2
    // at $99.1k), which slides the firstScoredIdx forward and produces a
    // wrong starting BE. 50,000 still rejects garbage rows.
    if (isNaN(price) || price < 50_000) continue;

    // Round went backward (or stayed at 0 → 0) → new season section has started.
    // prevRound >= 0 so the initial sentinel value of -1 doesn't trigger a false decrement.
    if (prevRound >= 0 && round <= prevRound) {
      year--;
    }
    prevRound = round;

    if (!result[year]) result[year] = new Map();
    const scoreStr = (cells[2] ?? '').trim();
    if (!scoreStr || scoreStr === '--' || scoreStr === 'DNP') continue;
    const score = parseInt(scoreStr, 10);
    if (!isNaN(score) && score >= 0) result[year].set(round, score);
  }
  return result;
}

// Keep the single-year parser for use by fetchAllPlayerRoundScores (legacy path)
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
    // Floor: SC's minimum player price is $99,100. The threshold must sit
    // below that or we silently drop every rookie's bubble rounds (R1/R2
    // at $99.1k), which slides the firstScoredIdx forward and produces a
    // wrong starting BE. 50,000 still rejects garbage rows.
    if (isNaN(price) || price < 50_000) continue;
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
      total_points:       scores?.totalPoints ?? 0,
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

export interface PlayerRoundScores {
  avg5: number;
  lastScore: number;
  roundScores: Record<number, number>; // round index → SC score (0 = DNP / not on page)
}

// ─── Match list ───────────────────────────────────────────────────────────────

export interface MatchEntry {
  round: number;
  homeTeam: string;    // canonical name
  homeAbbrev: string;
  awayTeam: string;    // canonical name
  awayAbbrev: string;
  venue: string;
  date: string;
  homeScore: number | null;
  awayScore: number | null;
}

function parseMatchListPage(html: string): MatchEntry[] {
  const entries: MatchEntry[] = [];
  if (!html) return entries;

  const roundAnchorRe = /(?:name|id)="round_(\d+)"/gi;
  const roundPositions: Array<{ round: number; pos: number }> = [];
  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = roundAnchorRe.exec(html)) !== null) {
    roundPositions.push({ round: parseInt(anchorMatch[1], 10), pos: anchorMatch.index });
  }

  for (let i = 0; i < roundPositions.length; i++) {
    const { round, pos } = roundPositions[i];
    const end = i + 1 < roundPositions.length ? roundPositions[i + 1].pos : html.length;
    const section = html.slice(pos, end);

    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(section)) !== null) {
      // Normalise: collapse newlines/tabs into spaces so "Sydney\nv \nCarlton" → "Sydney v Carlton"
      const cells = extractCells(rowMatch[1]).map(c => c.replace(/\s+/g, ' ').trim());
      if (cells.length < 3) continue;

      // Identify the match cell — contains " v " after normalisation
      const matchIdx = cells.findIndex(c => c.includes(' v '));
      if (matchIdx < 0) continue;

      const matchText = cells[matchIdx];
      const vIdx = matchText.indexOf(' v ');
      const homeTeamRaw = matchText.slice(0, vIdx).trim();
      const awayTeamRaw = matchText.slice(vIdx + 3).trim();
      if (!homeTeamRaw || !awayTeamRaw) continue;

      const homeResolved = resolveTeam(homeTeamRaw);
      const awayResolved = resolveTeam(awayTeamRaw);
      // id=0 means unrecognised team — skips header row ("Home v Away Teams") and BYE rows
      if (homeResolved.id === 0 || awayResolved.id === 0) continue;

      const venue = cells[matchIdx + 1]?.trim() ?? '';

      // Result: "NNN-NNN" pattern; absent for unplayed matches
      const resultCell = cells.find(c => /^\d+-\d+$/.test(c)) ?? null;
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      if (resultCell) {
        const [h, a] = resultCell.split('-');
        homeScore = parseInt(h, 10);
        awayScore = parseInt(a, 10);
      }

      entries.push({
        round,
        homeTeam: homeResolved.name,   homeAbbrev: homeResolved.abbrev,
        awayTeam: awayResolved.name,   awayAbbrev: awayResolved.abbrev,
        venue,
        date: cells[0]?.trim() ?? '',
        homeScore,
        awayScore,
      });
    }
  }

  console.log(`[FW match-list] parsed ${entries.length} matches`);
  return entries;
}

async function fetchMatchList(year: number): Promise<MatchEntry[]> {
  const html = await fetchWithRetry(
    `https://www.footywire.com/afl/footy/ft_match_list?year=${year}`
  );
  return parseMatchListPage(html);
}

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
    // Floor: SC's minimum player price is $99,100. The threshold must sit
    // below that or we silently drop every rookie's bubble rounds (R1/R2
    // at $99.1k), which slides the firstScoredIdx forward and produces a
    // wrong starting BE. 50,000 still rejects garbage rows.
    if (isNaN(price) || price < 50_000) continue;
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
    const roundScores: Record<number, number> = {};
    const recentFirst: number[] = [];
    for (let i = roundScoreMaps.length - 1; i >= 0; i--) {
      const score = roundScoreMaps[i][norm] ?? 0;
      roundScores[i] = score;
      if (score > 0) recentFirst.push(score);
    }
    output[player.id] = {
      lastScore: recentFirst[0] ?? 0,
      avg5: recentFirst.length > 0
        ? recentFirst.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(recentFirst.length, 5)
        : 0,
      roundScores,
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
    const roundScores: Record<number, number> = Object.fromEntries(roundMap.entries());
    output[id] = {
      lastScore: sorted[0] ?? 0,
      avg5: sorted.length > 0 ? sorted.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(sorted.length, 5) : 0,
      roundScores,
    };
  });
  return output;
}

// Fetch a player's round→score map for multiple years from a single pu- page fetch.
// FW ignores the ?year= param — the page always returns the full multi-year history.
// We parse all year sections at once by detecting when round numbers reset.
async function fetchPlayerHistoricalScores(
  firstName: string,
  lastName: string,
  teamName: string,
  years: number[],
): Promise<Record<number, Map<number, number>>> {
  const slug = buildPlayerSlug(teamName, `${firstName} ${lastName}`);
  console.log(`[HistScores] slug="${slug}" want=${JSON.stringify(years)}`);
  if (!slug) return {};

  const html = await fetchWithRetry(
    `https://www.footywire.com/afl/footy/${slug}`
  ).catch(() => '');

  // The page always leads with the current season. latestYear is the year
  // assigned to the first section — which is the highest year in the request.
  const latestYear = Math.max(...years);
  const allYears = parsePlayerAllYearsPage(html, latestYear);

  console.log(`[HistScores] htmlLen=${html.length} parsed=${Object.entries(allYears).map(([y, m]) => `${y}:${m.size}rds`).join(' ')}`);

  const result: Record<number, Map<number, number>> = {};
  for (const year of years) {
    result[year] = allYears[year] ?? new Map();
  }
  return result;
}

// ─── Per-round BE from price history ─────────────────────────────────────────
// The player profile page has columns: Round | Price | Score | Value.
// "Price" at round N is the price BEFORE that round's score is applied.
//
// SuperCoach price-change formula (calibrated 2026):
//     priceChange = (score - BE) × SC_DOLLARS_PER_POINT
// Solving for BE:
//     BE[N] = score[N] - (price[N+1] - price[N]) / SC_DOLLARS_PER_POINT
//
// For the last played round we *can't* derive BE (the formula needs the
// upcoming round's price), so we fall back to Footywire's published currentBE
// which is forward-looking — i.e. it represents the BE for round N+1, not N.
async function fetchPlayerRoundBEs(
  firstName: string,
  lastName: string,
  teamName: string,
  year: number,
  currentBE: number,
): Promise<Record<number, number>> {
  const slug = buildPlayerSlug(teamName, `${firstName} ${lastName}`);
  if (!slug) return {};

  const isCurrentYear = year === CURRENT_YEAR;
  const frozenKey = `${PLAYER_BE_KEY_PREFIX_FROZEN}${slug}_${year}`;
  const liveKey   = `${PLAYER_BE_KEY_PREFIX_LIVE}${slug}_${year}`;

  // Cache short-circuit. Frozen is permanent. For a closed season the
  // frozen row is the whole story; for the current year we additionally
  // need a fresh live row.
  try {
    const frozen = await getJson<Record<number, number>>(frozenKey);
    if (frozen) {
      if (!isCurrentYear) return frozen;
      const live = await getEntry<Record<number, number>>(liveKey);
      if (live && Date.now() - live.updatedAt < PLAYER_BE_TTL) {
        return { ...frozen, ...live.value };
      }
    }
  } catch { /* ignore */ }

  const html = await fetchWithRetry(
    `https://www.footywire.com/afl/footy/${slug}`
  ).catch(() => '');

  // Collect rows for the target year (page leads with current year, older years follow)
  const roundData: RoundDataRow[] = [];
  let curYear = year;
  let prevRound = -1;

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const cells = extractCells(m[1]);
    if (cells.length < 3) continue;
    const round = parseInt(cells[0], 10);
    if (isNaN(round) || round < 0 || round > 30) continue;
    const price = parseInt((cells[1] ?? '').replace(/[$,\s]/g, ''), 10);
    // Floor: SC's minimum player price is $99,100. The threshold must sit
    // below that or we silently drop every rookie's bubble rounds (R1/R2
    // at $99.1k), which slides the firstScoredIdx forward and produces a
    // wrong starting BE. 50,000 still rejects garbage rows.
    if (isNaN(price) || price < 50_000) continue;

    if (prevRound >= 0 && round <= prevRound) {
      curYear--;
      if (curYear < year) break; // passed target year, stop
    }
    prevRound = round;

    if (curYear === year) {
      const s = (cells[2] ?? '').trim();
      const score = s && s !== '--' && s !== 'DNP' ? parseInt(s, 10) : null;
      roundData.push({ round, price, score: score !== null && !isNaN(score) ? score : null });
    }
  }

  roundData.sort((a, b) => a.round - b.round);

  // Pure derivation lives in src/utils/beDerivation.ts so it's testable.
  // See that file for formula details and edge cases.
  const result = deriveBEMap(roundData, currentBE);
  const { frozen, live } = splitBEMap(result, roundData, isCurrentYear);

  try {
    if (Object.keys(frozen).length > 0) {
      await setJson(frozenKey, frozen, { permanent: true });
    }
    if (isCurrentYear && Object.keys(live).length > 0) {
      await setJson(liveKey, live);
    }
  } catch { /* ignore */ }

  return result;
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

export const footywireApi = { fetchBreakevenMap, fetchAllPlayers, fetchRoundScoresBulk, fetchAllPlayerRoundScores, fetchMatchList, fetchPlayerHistoricalScores, fetchPlayerRoundBEs, normaliseName, lookupPlayer };
