export interface FootywirePlayer {
  breakeven: number;
  likelihood: number;
  injuryStatus: 'INJ' | 'SUS' | null;
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

// Parse season page — full name in <a id="cellpid_XXXX">Full Name</a>
// INJ/SUS in <span class="playerflag" title="Injured|Suspended">
function parseSeasonPage(html: string): Record<string, 'INJ' | 'SUS'> {
  const result: Record<string, 'INJ' | 'SUS'> = {};
  if (!html) return result;

  const rows = html.split(/id="rowpid_\d+"/);
  for (const row of rows) {
    const nameMatch = row.match(/id="cellpid_\d+"[^>]*>([^<]+)<\/a>/i);
    if (!nameMatch) continue;

    const flagMatch = row.match(/class="playerflag"[^>]+title="(Injured|Suspended)"/i);
    if (!flagMatch) continue;

    result[normaliseName(nameMatch[1].trim())] = flagMatch[1] === 'Suspended' ? 'SUS' : 'INJ';
  }

  return result;
}

async function fetchBreakevenMap(): Promise<FootywireMap> {
  const beRes = await fetch('https://www.footywire.com/afl/footy/supercoach_breakevens', { headers: FW_HEADERS });
  if (!beRes.ok) throw new Error(`Footywire BE fetch failed: ${beRes.status}`);
  const beHtml = String((await beRes.text()) || '');

  const seasonRes = await fetch('https://www.footywire.com/afl/footy/supercoach_season', { headers: FW_HEADERS });
  if (!seasonRes.ok) throw new Error(`Footywire season fetch failed: ${seasonRes.status}`);
  const seasonHtml = String((await seasonRes.text()) || '');

  const beData = parseBreakevenPage(beHtml);
  const injData = parseSeasonPage(seasonHtml);

  const merged: FootywireMap = {};

  for (const [key, be] of Object.entries(beData)) {
    merged[key] = { ...be, injuryStatus: injData[key] ?? null };
  }

  for (const [key, status] of Object.entries(injData)) {
    if (!merged[key]) {
      merged[key] = { breakeven: 0, likelihood: 0, injuryStatus: status };
    }
  }

  const hasRows = beHtml.includes('rowpid_');
  console.log(`[Footywire] beHtml length: ${beHtml.length}, hasRowpid: ${hasRows}, rows parsed: ${Object.keys(beData).length}`);
  if (!hasRows) console.log(`[Footywire] beHtml sample: ${beHtml.substring(0, 500)}`);
  console.log(`[Footywire] Loaded ${Object.keys(merged).length} players, ${Object.values(injData).length} with INJ/SUS`);
  return merged;
}

export const footywireApi = { fetchBreakevenMap, normaliseName };
