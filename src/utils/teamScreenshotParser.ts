import type { TextRecognitionResult } from '@react-native-ml-kit/text-recognition';

export type ParsedPosition = 'DEF' | 'MID' | 'RUC' | 'FWD' | 'FLEX';

export interface ParsedPlayer {
  firstInitial: string;
  lastName: string;
  team: string;
  position: ParsedPosition;
  isBench: boolean;
}

const POSITION_BY_HEADER: Record<string, ParsedPosition> = {
  Defenders: 'DEF',
  Midfielders: 'MID',
  Rucks: 'RUC',
  Forwards: 'FWD',
  Flex: 'FLEX',
};

// Tolerate trailing junk (lock emoji, "FINAL"/"LIVE" status text) by not
// anchoring the end. Also allow up to three space-separated capitalised
// segments to cover names like "Van Der Merwe".
const PLAYER_NAME_RE = /^([A-Z])\.\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})\b/;
// AFL team abbreviations. Restricting to this set kills two false-positive sources
// at once: stat tokens like "DNP" / "MID" / "DEF" that match a generic [A-Z]{3}
// regex, and 3-letter score residue. Case-insensitive so blue/orange highlight
// cards where OCR returns "CoL" or "Adel" still parse.
const AFL_TEAMS = [
  'ADE', 'BRL', 'CAR', 'COL', 'ESS', 'FRE', 'GCS', 'GEE',
  'GWS', 'HAW', 'MEL', 'NTH', 'PTA', 'RIC', 'STK', 'SYD',
  'WBD', 'WCE',
];
const TEAM_TOKEN_RE = new RegExp(
  `(?<![A-Za-z])(${AFL_TEAMS.join('|')})(?![A-Za-z])`,
  'i',
);
// Section headers / bench column markers — never a player name.
const RESERVED_TOKENS = new Set([
  'DEF', 'MID', 'RUC', 'FWD', 'FLEX', 'EMG',
  'DNP', 'TBC', 'BYE', 'FINAL', 'LIVE',
]);

interface Line {
  text: string;
  cx: number;
  cy: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function flattenLines(result: TextRecognitionResult): Line[] {
  const out: Line[] = [];
  for (const block of result.blocks) {
    for (const ln of block.lines) {
      const f = ln.frame;
      if (!f) continue;
      out.push({
        text: ln.text.trim(),
        cx: f.left + f.width / 2,
        cy: f.top + f.height / 2,
        left: f.left,
        right: f.left + f.width,
        top: f.top,
        bottom: f.top + f.height,
      });
    }
  }
  return out;
}

export function parseTeamScreenshot(result: TextRecognitionResult): ParsedPlayer[] {
  const lines = flattenLines(result);
  if (lines.length === 0) return [];

  const imageWidth = Math.max(...lines.map(l => l.right));

  // Section headers tell us the Y bands for each position group on the field side.
  const headers: { label: keyof typeof POSITION_BY_HEADER; cy: number }[] = [];
  for (const ln of lines) {
    const cleaned = ln.text.trim();
    for (const key of Object.keys(POSITION_BY_HEADER) as (keyof typeof POSITION_BY_HEADER)[]) {
      if (cleaned.localeCompare(key, undefined, { sensitivity: 'base' }) === 0) {
        headers.push({ label: key, cy: ln.cy });
        break;
      }
    }
  }
  headers.sort((a, b) => a.cy - b.cy);

  const sectionAt = (cy: number): ParsedPosition | null => {
    let last: typeof headers[number] | null = null;
    for (const h of headers) {
      if (h.cy <= cy) last = h;
    }
    return last ? POSITION_BY_HEADER[last.label] : null;
  };

  // The bench is the right-hand column. We locate it from the "Bench" label if found,
  // otherwise fall back to the right ~28% of the image.
  const benchLabel = lines.find(l => l.text.trim().toLowerCase() === 'bench');
  const benchLeftEdge = benchLabel ? benchLabel.left - 20 : imageWidth * 0.72;

  const players: ParsedPlayer[] = [];
  let nameHits = 0;
  const noTeamNames: string[] = [];

  for (const ln of lines) {
    const match = ln.text.match(PLAYER_NAME_RE);
    if (!match) continue;
    // Don't let a stray 3-letter section header masquerade as a player name.
    if (RESERVED_TOKENS.has(match[2].toUpperCase())) continue;
    nameHits++;

    // The team line sits below the name on the same card. Pick the spatially closest
    // candidate (smallest Y delta) within a generous window — captain/VC cards have
    // taller layouts and bench cards are narrower than field cards.
    const SEARCH_X = 280;
    const SEARCH_Y_MAX = 200;
    let teamLine: typeof lines[number] | undefined;
    let bestDy = Infinity;
    for (const other of lines) {
      if (other === ln) continue;
      if (Math.abs(other.cx - ln.cx) > SEARCH_X) continue;
      const dy = other.cy - ln.cy;
      if (dy <= 0 || dy > SEARCH_Y_MAX) continue;
      if (!TEAM_TOKEN_RE.test(other.text)) continue;
      if (dy < bestDy) { bestDy = dy; teamLine = other; }
    }
    const isBench = ln.left >= benchLeftEdge;
    let position = sectionAt(ln.cy) ?? 'MID';
    // FLEX is a field-only slot; if a bench card's Y lands in the Flex band we assume
    // it's actually a FWD bench card sitting below the Forwards header.
    if (isBench && position === 'FLEX') position = 'FWD';

    let team = '';
    if (teamLine) {
      const teamMatch = teamLine.text.match(TEAM_TOKEN_RE);
      if (teamMatch) team = teamMatch[1].toUpperCase();
    }
    if (!team) {
      // Diagnostic — surfaces what's around the name when team OCR fails (highlighted
      // captain/VC cards, bench cards with merged price/score text).
      const nearby = lines
        .filter(o => o !== ln && Math.abs(o.cx - ln.cx) < 400 && o.cy > ln.cy - 40 && o.cy < ln.cy + 280)
        .slice(0, 12)
        .map(o => `"${o.text}"@(${Math.round(o.left)},${Math.round(o.top)})`)
        .join(', ');
      noTeamNames.push(
        `${match[1]}.${match[2]}@(${Math.round(ln.left)},${Math.round(ln.top)}) near=[${nearby}]`,
      );
      // Don't `continue` — emit the player with empty team. The matcher has a
      // surname+initial fallback that resolves "Xerri" (unique surname) and
      // "Anderson" (disambiguated by initial) without needing the team.
    }

    players.push({
      firstInitial: match[1],
      lastName: match[2],
      team,
      position,
      isBench,
    });
  }

  console.log(
    '[ScreenshotParser]', lines.length, 'lines /', headers.length, 'section headers /',
    nameHits, 'name matches /', noTeamNames.length, 'names without team /',
    players.length, 'players parsed',
  );
  if (noTeamNames.length) {
    console.log('[ScreenshotParser] no-team:', noTeamNames.join(', '));
  }
  console.log(
    '[ScreenshotParser] parsed:',
    players.map(p => `${p.firstInitial}.${p.lastName}/${p.team}/${p.position}${p.isBench ? '*' : ''}`).join(', '),
  );

  // Surface lines that *look* like they contain a player surname but didn't make it
  // into the parsed list. Filter is now keyed on (initial, surname) so two players
  // with the same surname (J. Daicos / N. Daicos, N. Anderson / A. Anderson) don't
  // cancel each other out.
  const SECTION_WORDS = new Set([
    'defenders', 'midfielders', 'rucks', 'forwards', 'flex', 'bench',
    'final', 'live', 'dnp', 'reset', 'tab', 'team', 'tools',
    'def', 'mid', 'ruc', 'fwd', 'emg',
  ]);
  const NAMED_LINE_RE = /([A-Za-z0-9])\.\s*([A-Z][a-zA-Z'\-]+)/;
  const parsedKeys = new Set(
    players.map(p => `${p.firstInitial.toLowerCase()}|${p.lastName.toLowerCase()}`),
  );
  const suspect: string[] = [];
  for (const l of lines) {
    if (l.text.length > 30) continue;
    const m = l.text.match(NAMED_LINE_RE);
    if (!m) continue;
    const surname = m[2].toLowerCase();
    if (SECTION_WORDS.has(surname)) continue;
    const key = `${m[1].toLowerCase()}|${surname}`;
    if (parsedKeys.has(key)) continue;
    suspect.push(`"${l.text}"@(${Math.round(l.left)},${Math.round(l.top)})`);
    if (suspect.length >= 30) break;
  }
  if (suspect.length) {
    console.log('[ScreenshotParser] suspect:', suspect.join(', '));
  }

  return players;
}
