import { describe, expect, it } from 'vitest';
import {
  clubsOf,
  DEFAULT_MATCH_ID,
  formatMatchDate,
  shortClub,
  matchLabel,
  parseMatchIndex,
  shortCompetition,
} from './matches';
import { compareTeams, kmh, parsePhysical, playersOf } from './physical';
import { shippedText } from './testTracking';

const index = parseMatchIndex(JSON.parse(shippedText('index.json')));

describe('the match index', () => {
  it('validates the shipped index: seven matches, the default among them', () => {
    expect(index).toHaveLength(7);
    expect(index.map((m) => m.id)).toContain(DEFAULT_MATCH_ID);
  });

  it('refuses anything of another shape', () => {
    const first = index[0];
    expect(() => parseMatchIndex([])).toThrow();
    expect(() => parseMatchIndex([{ ...first, id: '../x' }])).toThrow();
    expect(() => parseMatchIndex([{ ...first, score: [1] }])).toThrow();
    expect(() => parseMatchIndex({ matches: [] })).toThrow();
  });

  it('shortens a club name to what is said on a terrace', () => {
    expect(index.flatMap((m) => [m.home, m.away]).map(shortClub)).toEqual([
      'Fortuna Düsseldorf',
      'Jahn Regensburg',
      'Fortuna Düsseldorf',
      'Hansa Rostock',
      'Nürnberg',
      'Fortuna Düsseldorf',
      'St. Pauli',
      'Fortuna Düsseldorf',
      'Kaiserslautern',
      'Fortuna Düsseldorf',
      'Köln',
      'Bayern München',
      'Bayer Leverkusen',
      'Bochum',
    ]);
    // A name with nothing but a form and a number stays whole.
    expect(shortClub('FC 08')).toBe('FC 08');
  });

  it('labels a match with clubs, result, date and competition, in either language', () => {
    const koeln = index.find((m) => m.id === 'J03WMX');
    if (koeln === undefined) throw new Error('J03WMX missing');
    expect(matchLabel(koeln, 'en')).toBe('Köln 1–2 Bayern München · 27 May 2023 · Bundesliga');
    expect(matchLabel(koeln, 'bs')).toBe('Köln 1–2 Bayern München · 27. maj 2023. · Bundesliga');
    // Written from our own tables: a browser without Bosnian data cannot print "2022 M08 26".
    expect(formatMatchDate('2022-08-26', 'bs')).toBe('26. august 2022.');
    expect(formatMatchDate('2022-08-26', 'en')).toBe('26 August 2022');
    expect(shortCompetition('2. Bundesliga 2022/2023')).toBe('2. Bundesliga');
    expect(clubsOf(koeln)).toEqual({ home: '1. FC Köln', away: 'FC Bayern München' });
  });
});

describe('the physical report', () => {
  const report = parsePhysical(JSON.parse(shippedText('J03WN1.physical.json')));

  it('validates every shipped file and covers each side', () => {
    for (const match of index) {
      const each = parsePhysical(JSON.parse(shippedText(`${match.id}.physical.json`)));
      expect(playersOf(each, 'home').length).toBe(each.totals.home.players);
      expect(playersOf(each, 'away').length).toBe(each.totals.away.players);
    }
    expect(() => parsePhysical({ ...report, formatVersion: 2 })).toThrow();
  });

  it('compares the two teams measure by measure, the larger value as the full bar', () => {
    const rows = compareTeams(report);
    expect(rows.map((r) => r.key)).toEqual(['distanceKm', 'highSpeedKm', 'sprints', 'topSpeed']);
    const distance = rows[0];
    expect(distance?.values).toEqual({ home: 90.98, away: 104.95 });
    expect(distance?.shares.away).toBe(1);
    expect(distance?.shares.home).toBeCloseTo(90.98 / 104.95);
    const empty = compareTeams({
      ...report,
      totals: {
        home: { ...report.totals.home, sprints: 0 },
        away: { ...report.totals.away, sprints: 0 },
      },
    });
    expect(empty[2]?.shares).toEqual({ home: 0, away: 0 });
  });

  it('converts metres per second to kilometres per hour', () => {
    expect(kmh(10)).toBe(36);
  });
});
