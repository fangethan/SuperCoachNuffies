export interface FootywirePlayer {
  breakeven: number;
  likelihood: number;
  injuryStatus: 'INJ' | 'SUS' | null;
  injuryDetail: string | null;  // body part or null
  returning: string | null;     // "1-2 weeks", "Round 8", "TBC", etc.
}

export type FootywireMap = Record<string, FootywirePlayer>;

export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

const FW_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.footywire.com/',
};

// Parse breakevens page — full name in <span class="hiddenspan">Full Name</span>
// Cells per row: player | team | price | games | avg | breakeven | likelihood%
function parseBreakevenPage(html: string): Record<string, { breakeven: number; likelihood: number }> {
  const result: Record<string, { breakeven: number; likelihood: number }> = {};
  if (!html) return result;

  const rows = html.split(/id="rowpid_\d+"/);
  for (const row of rows) {
    const nameMatch = row.match(/class="hiddenspan"[^>]*>([^<]+)<\/span>/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name) continue;

    const cells: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m: RegExpExecArray | null;
    while ((m = tdRe.exec(row)) !== null) {
      cells.push(m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    }

    if (cells.length < 6) continue;

    // Use parseInt directly — handles negatives; NaN check avoids the || 0 trap
    const breakeven = parseInt(cells[5], 10);
    const likelihood = parseFloat((cells[6] ?? '').replace('%', ''));

    result[normaliseName(name)] = {
      breakeven: isNaN(breakeven) ? 0 : breakeven,
      likelihood: isNaN(likelihood) ? 0 : likelihood,
    };
  }

  return result;
}

interface InjuryEntry {
  status: 'INJ' | 'SUS';
  detail: string;    // body part e.g. "Hamstring", or "Suspended"
  returning: string; // e.g. "1-2 weeks", "Round 8", "TBC"
}

// Parse injury list page — /afl/footy/injury_list
// Columns: Player | Injury (body part or "Suspended") | Returning
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

    // Plain-text <td> cells only (player name cell has child tags so is skipped)
    const cells: string[] = [];
    const tdRe = /<td[^>]*>([^<]*)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(row)) !== null) {
      cells.push(tdMatch[1].replace(/&nbsp;/g, '').trim());
    }

    const detail = cells[0] ?? '';
    const returning = cells[1] ?? '';
    const status: 'INJ' | 'SUS' = detail === 'Suspended' ? 'SUS' : 'INJ';

    result[normaliseName(name)] = { status, detail, returning };
  }

  return result;
}

async function fetchBreakevenMap(): Promise<FootywireMap> {
  const injRes = await fetch('https://www.footywire.com/afl/footy/injury_list');
  if (!injRes.ok) throw new Error(`INJ fetch failed: ${injRes.status}`);
  const injHtml = String((await injRes.text()) || '');

  const beRes = await fetch('https://www.footywire.com/afl/footy/supercoach_breakevens');
  if (!beRes.ok) throw new Error(`BE fetch failed: ${beRes.status}`);
  const beHtml = String((await beRes.text()) || '');

  const beData = parseBreakevenPage(beHtml);
  const injData = parseInjuryListPage(injHtml);

  const debugMsg = `inj:${injHtml.length}b/${Object.keys(injData).length}p be:${beHtml.length}b/${Object.keys(beData).length}p`;
  console.log(`[Footywire] ${debugMsg}`);

  const merged: FootywireMap = {};

  for (const [key, be] of Object.entries(beData)) {
    const inj = injData[key];
    merged[key] = {
      ...be,
      injuryStatus: inj?.status ?? null,
      injuryDetail: inj?.detail ?? null,
      returning: inj?.returning ?? null,
    };
  }

  for (const [key, inj] of Object.entries(injData)) {
    if (!merged[key]) {
      merged[key] = {
        breakeven: 0, likelihood: 0,
        injuryStatus: inj.status,
        injuryDetail: inj.detail,
        returning: inj.returning,
      };
    }
  }

  const hasRows = beHtml.includes('rowpid_');
  console.log(`[Footywire] beHtml length: ${beHtml.length}, hasRowpid: ${hasRows}, rows parsed: ${Object.keys(beData).length}`);
  if (!hasRows) console.log(`[Footywire] beHtml sample: ${beHtml.substring(0, 500)}`);
  (merged as any).__debug = debugMsg;
  return merged;
}

// Look up a player by full name, falling back to last-name + first-initial if no exact match.
// Handles nickname mismatches like "Cam Rayner" ↔ "Cameron Rayner".
function lookupPlayer(map: FootywireMap, firstName: string, lastName: string): FootywirePlayer | undefined {
  const fullKey = normaliseName(`${firstName} ${lastName}`);
  if (map[fullKey]) return map[fullKey];

  // Fallback: last name + first initial
  const lastNorm = normaliseName(lastName);
  const firstInitial = normaliseName(firstName)[0];
  if (!firstInitial || !lastNorm) return undefined;

  for (const key of Object.keys(map)) {
    const parts = key.split(' ');
    if (parts.length < 2) continue;
    const keyLast = parts[parts.length - 1];
    const keyFirst = parts[0][0];
    if (keyLast === lastNorm && keyFirst === firstInitial) return map[key];
  }

  return undefined;
}

export const footywireApi = { fetchBreakevenMap, normaliseName, lookupPlayer };
