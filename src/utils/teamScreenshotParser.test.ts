import { parseTeamScreenshot } from './teamScreenshotParser';

/**
 * Build the minimum shape of an ML Kit TextRecognitionResult that the parser
 * actually reads (text + frame on each line). We don't need the rest of ML
 * Kit's payload (corner points, elements, etc.) — those go through the
 * type-only import and never hit runtime.
 */
function mkResult(lines: Array<{ text: string; left: number; top: number; width?: number; height?: number }>): any {
  return {
    text: lines.map(l => l.text).join('\n'),
    blocks: [
      {
        text: lines.map(l => l.text).join('\n'),
        frame: { left: 0, top: 0, width: 1000, height: 1500 },
        cornerPoints: [],
        lines: lines.map(l => ({
          text: l.text,
          frame: {
            left: l.left,
            top: l.top,
            width: l.width ?? 100,
            height: l.height ?? 20,
          },
          cornerPoints: [],
          elements: [],
        })),
      },
    ],
  };
}

describe('parseTeamScreenshot', () => {
  test('empty input returns empty array', () => {
    expect(parseTeamScreenshot({ text: '', blocks: [] } as any)).toEqual([]);
  });

  test('parses a single field-side player under a Defenders header', () => {
    const result = mkResult([
      { text: 'Defenders',  left: 50,  top: 100 },
      { text: 'M. Bontempelli', left: 50, top: 200 },
      { text: 'WBD',        left: 50,  top: 230 },
    ]);
    const players = parseTeamScreenshot(result);
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({
      firstInitial: 'M',
      lastName: 'Bontempelli',
      team: 'WBD',
      position: 'DEF',
      isBench: false,
    });
  });

  test('places players in the section whose header is closest above', () => {
    const result = mkResult([
      { text: 'Defenders',    left: 50, top: 100 },
      { text: 'D. Player',    left: 50, top: 200 }, { text: 'CAR', left: 50, top: 230 },
      { text: 'Midfielders',  left: 50, top: 400 },
      { text: 'M. Player',    left: 50, top: 500 }, { text: 'CAR', left: 50, top: 530 },
      { text: 'Rucks',        left: 50, top: 700 },
      { text: 'R. Player',    left: 50, top: 800 }, { text: 'CAR', left: 50, top: 830 },
      { text: 'Forwards',     left: 50, top: 1000 },
      { text: 'F. Player',    left: 50, top: 1100 }, { text: 'CAR', left: 50, top: 1130 },
    ]);
    const players = parseTeamScreenshot(result);
    expect(players.find(p => p.firstInitial === 'D')?.position).toBe('DEF');
    expect(players.find(p => p.firstInitial === 'M')?.position).toBe('MID');
    expect(players.find(p => p.firstInitial === 'R')?.position).toBe('RUC');
    expect(players.find(p => p.firstInitial === 'F')?.position).toBe('FWD');
  });

  test('detects bench from a "Bench" label', () => {
    // Image width inferred from the rightmost line. Bench label at 800
    // pulls benchLeftEdge to ~780; the bench player at 820 should be tagged.
    const result = mkResult([
      { text: 'Defenders',  left: 50,  top: 100 },
      { text: 'A. Field',   left: 50,  top: 200 }, { text: 'CAR', left: 50,  top: 230 },
      { text: 'Bench',      left: 800, top: 100, width: 100 },
      { text: 'B. Bench',   left: 820, top: 200 }, { text: 'CAR', left: 820, top: 230 },
    ]);
    const players = parseTeamScreenshot(result);
    expect(players.find(p => p.lastName === 'Field')?.isBench).toBe(false);
    expect(players.find(p => p.lastName === 'Bench')?.isBench).toBe(true);
  });

  test('falls back to right ~28% of image when no Bench label exists', () => {
    // No Bench label → benchLeftEdge = imageWidth * 0.72.
    // Image width inferred from rightmost line — 850 here, so threshold ≈ 612.
    const result = mkResult([
      { text: 'Defenders',  left: 50,  top: 100 },
      { text: 'A. Field',   left: 50,  top: 200 }, { text: 'CAR', left: 50,  top: 230 },
      { text: 'B. Bench',   left: 700, top: 200 }, { text: 'CAR', left: 700, top: 230, width: 150 },
    ]);
    const players = parseTeamScreenshot(result);
    expect(players.find(p => p.lastName === 'Field')?.isBench).toBe(false);
    expect(players.find(p => p.lastName === 'Bench')?.isBench).toBe(true);
  });

  test('reassigns FLEX → FWD on the bench (FLEX is field-only)', () => {
    const result = mkResult([
      { text: 'Forwards',   left: 50,  top: 100 },
      { text: 'Flex',       left: 50,  top: 300 },
      { text: 'F. Bench',   left: 820, top: 350 }, { text: 'CAR', left: 820, top: 380 },
      { text: 'Bench',      left: 800, top: 50,  width: 100 },
    ]);
    const players = parseTeamScreenshot(result);
    const bench = players.find(p => p.lastName === 'Bench');
    expect(bench?.isBench).toBe(true);
    expect(bench?.position).toBe('FWD');
  });

  test('reserved tokens like "DNP" are never parsed as player names', () => {
    // The OCR can produce stray three-letter all-caps tokens (DNP, EMG, etc).
    // The regex would accept "D. NP" but the RESERVED_TOKENS guard rejects it.
    const result = mkResult([
      { text: 'Defenders',  left: 50, top: 100 },
      { text: 'A. DNP',     left: 50, top: 200 },                       // should be skipped
      { text: 'B. Real',    left: 50, top: 250 }, { text: 'CAR', left: 50, top: 280 },
    ]);
    const players = parseTeamScreenshot(result);
    expect(players.map(p => p.lastName)).toEqual(['Real']);
  });

  test('two players with the same surname both parse (different initials)', () => {
    // "J. Daicos" and "N. Daicos" — the parsed-key dedupe is on (initial, surname).
    const result = mkResult([
      { text: 'Midfielders', left: 50, top: 100 },
      { text: 'J. Daicos',   left: 50, top: 200 }, { text: 'COL', left: 50, top: 230 },
      { text: 'N. Daicos',   left: 50, top: 300 }, { text: 'COL', left: 50, top: 330 },
    ]);
    const players = parseTeamScreenshot(result);
    expect(players).toHaveLength(2);
    expect(players.map(p => p.firstInitial).sort()).toEqual(['J', 'N']);
  });

  test('emits player with empty team when team OCR fails (matcher fallback handles it)', () => {
    // Highlighted captain card sometimes drops the team line — we still
    // emit the player so the surname+initial matcher can resolve them.
    const result = mkResult([
      { text: 'Forwards',   left: 50, top: 100 },
      { text: 'X. Xerri',   left: 50, top: 200 },
      // intentionally no team line
    ]);
    const players = parseTeamScreenshot(result);
    expect(players).toHaveLength(1);
    expect(players[0].team).toBe('');
  });

  test('case-insensitive team token (OCR can return mixed case)', () => {
    const result = mkResult([
      { text: 'Defenders', left: 50, top: 100 },
      { text: 'C. Curnow', left: 50, top: 200 },
      { text: 'CoL',       left: 50, top: 230 },
    ]);
    const players = parseTeamScreenshot(result);
    expect(players[0].team).toBe('COL');
  });

  test('rejects 3-letter tokens that are not real AFL teams', () => {
    // A bare "DNP" near a name shouldn't be mistaken for a team. Verifies
    // the team regex constrains to the AFL_TEAMS list.
    const result = mkResult([
      { text: 'Defenders', left: 50, top: 100 },
      { text: 'A. Player', left: 50, top: 200 },
      { text: 'XYZ',       left: 50, top: 230 },                        // not a valid team
    ]);
    const players = parseTeamScreenshot(result);
    expect(players[0].team).toBe('');
  });

  test('handles multi-segment surnames like "Van Der Merwe"', () => {
    const result = mkResult([
      { text: 'Defenders',         left: 50, top: 100 },
      { text: 'D. Van Der Merwe',  left: 50, top: 200 }, { text: 'CAR', left: 50, top: 230 },
    ]);
    const players = parseTeamScreenshot(result);
    expect(players[0].lastName).toBe('Van Der Merwe');
  });
});
