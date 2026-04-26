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
  // 1. Full name in hiddenspan (breakeven-style pages)
  const hidden = row.match(/class="hiddenspan"[^>]*>([^<]+)<\/span>/i);
  if (hidden?.[1]?.trim()) return hidden[1].trim();
  // 2. Player profile link text
  const link = row.match(/href="\/afl\/footy\/pu-[^"]*">([^<]+)<\/a>/i);
  if (link?.[1]?.trim()) return link[1].trim();
  return null;
}

function extractPositions(row: string): Position[] {
  const found = [...new Set(
    [...row.matchAll(/\b(DEF|MID|FWD|RUC)\b/g)].map(m => m[1] as 'DEF' | 'MID' | 'FWD' | 'RUC')
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
interface ScoresRow  { avg3: number; avg5: number; roundScores: number[]; }
interface PricesRow  { price: number; totalChange: number; lastChange: number; }
interface RoundRow   { roundScore: number; }

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

function parseScoresPage(html: string): Record<string, ScoresRow> {
  const result: Record<string, ScoresRow> = {};
  const rows = splitRows(html);
  for (const row of rows) {
    const name = extractPlayerName(row);
    if (!name) continue;
    const cells = extractCells(row);
    if (cells.length < 4) continue;
    const priceIdx = findPriceIdx(cells);
    let avg3 = 0;
    let avg5 = 0;
    const roundScores: number[] = [];

    if (priceIdx >= 0) {
      // Try pre-calculated avg3 at priceIdx+3 or priceIdx+4 (page-dependent)
      for (const offset of [3, 4, 2]) {
        const v = parseFloat(cells[priceIdx + offset] ?? '');
        if (!isNaN(v) && v >= 30 && v <= 220) { avg3 = v; break; }
      }
      // Extract individual round scores — pure integers 0-250 after the avg columns
      const startIdx = priceIdx + 4;
      for (let i = startIdx; i < cells.length; i++) {
        const raw = cells[i].trim();
        if (/^\d+$/.test(raw)) {
          const v = parseInt(raw, 10);
          if (v >= 0 && v <= 250) roundScores.push(v);
        }
      }
    } else {
      // No price found — collect all pure-integer cells as round scores
      for (const cell of cells.slice(2)) {
        const raw = cell.trim();
        if (/^\d+$/.test(raw)) {
          const v = parseInt(raw, 10);
          if (v >= 0 && v <= 250) roundScores.push(v);
        }
      }
    }

    // Calculate from individual scores when pre-calculated values unavailable
    const played = roundScores.filter(s => s > 0);
    if (avg3 === 0 && played.length >= 3) {
      avg3 = played.slice(-3).reduce((a, b) => a + b, 0) / 3;
    }
    if (played.length >= 5) {
      avg5 = played.slice(-5).reduce((a, b) => a + b, 0) / 5;
    }

    result[normaliseName(name)] = { avg3, avg5, roundScores };
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

function parseRoundPage(html: string): Record<string, RoundRow> {
  const result: Record<string, RoundRow> = {};
  const rows = splitRows(html);
  for (const row of rows) {
    const name = extractPlayerName(row);
    if (!name) continue;
    const cells = extractCells(row);
    if (cells.length < 4) continue;
    const priceIdx = findPriceIdx(cells);
    let roundScore = 0;
    if (priceIdx >= 0) {
      // Scan 1-4 cells after price for an integer in AFL score range [0, 250]
      for (let offset = 1; offset <= 4; offset++) {
        const raw = (cells[priceIdx + offset] ?? '').trim();
        // Must be a pure integer (no commas, no decimals) in range
        if (/^\d+$/.test(raw)) {
          const v = parseInt(raw, 10);
          if (v >= 0 && v <= 250) { roundScore = v; break; }
        }
      }
    } else {
      // Fallback: scan cells[3..7] for a pure integer in AFL range
      for (const idx of [5, 4, 6, 3]) {
        const raw = (cells[idx] ?? '').trim();
        if (/^\d+$/.test(raw)) {
          const v = parseInt(raw, 10);
          if (v >= 0 && v <= 250) { roundScore = v; break; }
        }
      }
    }
    result[normaliseName(name)] = { roundScore };
  }
  console.log(`[FW round] parsed ${Object.keys(result).length} players`);
  return result;
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
  const hasRowpid     = html.includes('rowpid_');
  const hasDarkColor  = html.includes('darkcolor');
  const hasHiddenSpan = html.includes('hiddenspan');
  const hasPuLink     = html.includes('/afl/footy/pu-');
  const trCount       = (html.match(/<tr/gi) ?? []).length;
  const tdCount       = (html.match(/<td/gi) ?? []).length;
  console.log(`[FW fetch] ${url.split('/').pop()?.split('?')[0]} — ${html.length}b | rowpid:${hasRowpid} darkcolor:${hasDarkColor} hiddenspan:${hasHiddenSpan} pu-link:${hasPuLink} tr:${trCount} td:${tdCount}`);
  console.log(`[FW sample] ${html.substring(0, 400)}`);
  return html;
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
  // Breakeven page is canonical: proven to parse all players with team/price/games/avg
  const [beHtml, scoresHtml, pricesHtml, roundHtml, injHtml] = await Promise.all([
    getText(`https://www.footywire.com/afl/footy/supercoach_breakevens?year=${year}`),
    getText(`https://www.footywire.com/afl/footy/supercoach_scores?year=${year}`),
    getText(`https://www.footywire.com/afl/footy/supercoach_prices?year=${year}`),
    getText(`https://www.footywire.com/afl/footy/supercoach_round?year=${year}&round=${round}`),
    getText('https://www.footywire.com/afl/footy/injury_list'),
  ]);

  const beData     = parseBreakevenFullPage(beHtml);   // canonical — 789 players
  const scoresData = parseScoresPage(scoresHtml);
  const pricesData = parsePricesPage(pricesHtml);
  const roundData  = parseRoundPage(roundHtml);
  const injData    = parseInjuryListPage(injHtml);

  const players: Player[] = [];

  for (const [normName, be] of Object.entries(beData)) {
    const scores = scoresData[normName];
    const prices = pricesData[normName];
    const rd     = roundData[normName];
    const inj    = injData[normName];

    const { firstName, lastName } = splitName(
      normName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    );

    const team = resolveTeam(be.teamRaw);
    const id   = stableId(normName);

    // Last-round score: prefer round page, fall back to most recent individual score
    const played = (scores?.roundScores ?? []).filter(s => s > 0);
    const lastScore = rd?.roundScore ?? (played.length > 0 ? played[played.length - 1] : 0);

    const stats: PlayerStats = {
      player_id: id,
      round,

      points:             lastScore,
      total_points:       0,
      price:              prices?.price       ?? be.price,
      price_change:       prices?.lastChange  ?? 0,
      total_price_change: prices?.totalChange ?? 0,
      avg:                be.avg,
      avg3:               scores?.avg3        ?? 0,
      avg5:               scores?.avg5        ?? 0,
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
      positions:    be.positions,
      player_stats: [stats],
      notes: [],
      odds:  [],
    };

    players.push(player);
  }

  console.log(`[FW aggregate] ${players.length} players built for round ${round}`);
  return players;
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

export const footywireApi = { fetchBreakevenMap, fetchAllPlayers, normaliseName, lookupPlayer };
