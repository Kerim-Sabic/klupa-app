import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FINAL_2018, golden, loadIndex, loadMatch } from '../../test/proFixtures';
import { chanceRace, goals, matchMinute, periodSpans } from './timeline';

describe('matchMinute', () => {
  it('counts the first minute as 1 and starts each period on the scheduled minute', () => {
    expect(matchMinute(1, 0).label).toBe('1');
    expect(matchMinute(1, 59).label).toBe('1');
    expect(matchMinute(1, 60).label).toBe('2');
    expect(matchMinute(2, 0).label).toBe('46');
    expect(matchMinute(3, 30).label).toBe('91');
    expect(matchMinute(4, 14 * 60).label).toBe('120');
  });

  it('writes stoppage time as 45+2 and 90+4', () => {
    expect(matchMinute(1, 46 * 60 + 5)).toEqual({ minute: 45, stoppage: 2, label: '45+2' });
    expect(matchMinute(2, 48 * 60)).toEqual({ minute: 90, stoppage: 4, label: '90+4' });
    expect(matchMinute(3, 15 * 60).label).toBe('105+1');
  });

  it('never runs backwards inside a period', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(4000), fc.nat(4000), (period, a, b) => {
        const [early, late] = a <= b ? [a, b] : [b, a];
        const x = matchMinute(period, early);
        const y = matchMinute(period, late);
        expect(x.minute * 100 + x.stoppage).toBeLessThanOrEqual(y.minute * 100 + y.stoppage);
      }),
    );
  });
});

describe('periodSpans', () => {
  it('lays the periods end to end', () => {
    const spans = periodSpans(loadMatch(FINAL_2018));
    expect(spans).toEqual([
      { period: 1, from: 0, to: 2905, startMinute: 0 },
      { period: 2, from: 2905, to: 5907, startMinute: 45 },
    ]);
  });
});

describe('chanceRace', () => {
  it('ends at the golden chance-quality totals with one step per shot', () => {
    const match = loadMatch(FINAL_2018);
    const race = chanceRace(match);
    const expected = golden.perMatch[String(FINAL_2018)];
    expect(race.at(-1)?.units).toEqual(expected?.xgUnits);
    expect(race.filter((step) => step.shot !== null)).toHaveLength(22);
    expect(race[0]).toMatchObject({ elapsed: 0, units: [0, 0], shot: null });
    expect(race.at(-1)?.elapsed).toBe(5907);
  });

  it('never decreases and never runs backwards in time, in any match', () => {
    fc.assert(
      fc.property(fc.constantFrom(...loadIndex().matches.map((m) => m.id)), (id) => {
        const race = chanceRace(loadMatch(id));
        race.slice(1).forEach((step, i) => {
          const before = race[i];
          expect(step.elapsed).toBeGreaterThanOrEqual(before?.elapsed ?? 0);
          expect(step.units[0]).toBeGreaterThanOrEqual(before?.units[0] ?? 0);
          expect(step.units[1]).toBeGreaterThanOrEqual(before?.units[1] ?? 0);
        });
      }),
      { numRuns: 25 },
    );
  });

  it('is flat for a match with no shots', () => {
    const race = chanceRace({ periods: [], events: [] });
    expect(race).toHaveLength(2);
    expect(race[1]).toMatchObject({ elapsed: 0, units: [0, 0] });
  });
});

describe('goals', () => {
  it('lists the 2018 final 4-2 in order, with the own goal, the penalty and assists', () => {
    const list = goals(loadMatch(FINAL_2018));
    expect(
      list.map((g) => [g.minute.label, g.team, g.scorer, g.penalty, g.ownGoal, g.assist]),
    ).toEqual([
      ['18', 0, 'M. Mandžukić', false, true, null],
      ['28', 1, 'I. Perišić', false, false, 'D. Vida'],
      ['38', 0, 'A. Griezmann', true, false, null],
      ['59', 0, 'P. Pogba', false, false, null],
      ['65', 0, 'K. Mbappé', false, false, null],
      ['69', 1, 'M. Mandžukić', false, false, null],
    ]);
    expect(list.filter((g) => g.team === 0)).toHaveLength(4);
    expect(list.filter((g) => g.team === 1)).toHaveLength(2);
    const own = list.find((g) => g.ownGoal);
    expect(own).toMatchObject({ team: 0, assist: null, penalty: false });
    expect(list.find((g) => g.penalty)?.scorer).toBe('A. Griezmann');
  });

  it('agrees with the header score in every match', () => {
    for (const summary of loadIndex().matches) {
      const list = goals(loadMatch(summary.id));
      expect([0, 1].map((team) => list.filter((g) => g.team === team).length)).toEqual(
        summary.score,
      );
    }
    // All 115 matches are read from disk: allow for a busy machine.
  }, 60_000);
});
