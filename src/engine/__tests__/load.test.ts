import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isIsoDate, reviewLoad, weekStart, weeklyLoad, type LoadEntry } from '../load';
import { EngineError } from '../types';

function entry(date: string, minutes: number, rpe: number | null, playerId = 'p1'): LoadEntry {
  return { playerId, date, minutes, rpe, kind: 'session' };
}

/** Three baseline weeks (Mon 2 Nov, 9 Nov, 16 Nov 2026) at load 100 each. */
function baseline(playerId = 'p1'): LoadEntry[] {
  return ['2026-11-02', '2026-11-09', '2026-11-16'].map((date) => entry(date, 10, 10, playerId));
}

const AS_OF = '2026-11-25'; // a Wednesday; its week starts Monday 2026-11-23

function reviewOne(
  entries: LoadEntry[],
  extra: object = {},
): ReturnType<typeof reviewLoad>[number] {
  const row = reviewLoad(entries, { asOf: AS_OF, ...extra })[0];
  if (row === undefined) throw new Error('expected one review row');
  return row;
}

describe('weekStart', () => {
  it('returns the Monday of the ISO week', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });

  it('puts both sides of a year boundary in the same week', () => {
    expect(weekStart('2026-12-31')).toBe('2026-12-28');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
    expect(weekStart('2027-01-04')).toBe('2027-01-04');
  });

  it('handles leap days and dates before 1970', () => {
    expect(weekStart('2028-02-29')).toBe('2028-02-28');
    expect(weekStart('1969-12-31')).toBe('1969-12-29');
  });

  it('rejects anything that is not a real YYYY-MM-DD date', () => {
    for (const bad of [
      '2026-13-01',
      '2026-02-30',
      '2026-1-1',
      '20261101',
      '',
      '2026-11-01T00:00',
    ]) {
      expect(() => weekStart(bad)).toThrow(EngineError);
      expect(isIsoDate(bad)).toBe(false);
    }
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
  });

  it('always returns a Monday no more than six days back', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), (offset) => {
        const date = new Date(Date.UTC(1990, 0, 1 + offset)).toISOString().slice(0, 10);
        const monday = new Date(`${weekStart(date)}T00:00:00Z`);
        const days = (new Date(`${date}T00:00:00Z`).getTime() - monday.getTime()) / 86_400_000;
        expect(monday.getUTCDay()).toBe(1);
        expect(days).toBeGreaterThanOrEqual(0);
        expect(days).toBeLessThanOrEqual(6);
      }),
    );
  });
});

describe('weeklyLoad', () => {
  it('adds minutes, load and counts exactly', () => {
    const rows = weeklyLoad([
      entry('2026-11-02', 60, 5),
      entry('2026-11-04', 30, null),
      { ...entry('2026-11-08', 20, 8), kind: 'match' },
    ]);
    expect(rows).toEqual([
      {
        playerId: 'p1',
        weekStart: '2026-11-02',
        minutes: 110,
        load: 60 * 5 + 20 * 8,
        ratedMinutes: 80,
        unratedMinutes: 30,
        sessions: 3,
      },
    ]);
  });

  it('shows a rest week between two active weeks as zeros', () => {
    const rows = weeklyLoad([entry('2026-11-02', 60, 5), entry('2026-11-16', 60, 5)]);
    expect(rows.map((row) => row.weekStart)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(rows[1]).toMatchObject({ minutes: 0, load: 0, sessions: 0 });
  });

  it('keeps players separate and ordered, and handles no entries', () => {
    const rows = weeklyLoad([entry('2026-11-02', 10, 5, 'b'), entry('2026-11-02', 20, 5, 'a')]);
    expect(rows.map((row) => [row.playerId, row.minutes])).toEqual([
      ['a', 20],
      ['b', 10],
    ]);
    expect(weeklyLoad([])).toEqual([]);
  });

  it('rejects impossible records', () => {
    expect(() => weeklyLoad([entry('2026-02-30', 10, 5)])).toThrow(EngineError);
    expect(() => weeklyLoad([entry('2026-11-02', -1, 5)])).toThrow(EngineError);
    expect(() => weeklyLoad([entry('2026-11-02', Number.NaN, 5)])).toThrow(EngineError);
    expect(() => weeklyLoad([entry('2026-11-02', 10, 0)])).toThrow(EngineError);
    expect(() => weeklyLoad([entry('2026-11-02', 10, 11)])).toThrow(EngineError);
    expect(() => weeklyLoad([entry('2026-11-02', 10, Number.NaN)])).toThrow(EngineError);
    expect(() => weeklyLoad([entry('2026-11-02', 10, 5, '')])).toThrow(EngineError);
    const wrongKind = { ...entry('2026-11-02', 10, 5), kind: 'gym' } as unknown as LoadEntry;
    expect(() => weeklyLoad([wrongKind])).toThrow(EngineError);
  });
});

describe('reviewLoad statuses', () => {
  it('no_data: nothing recorded this week', () => {
    const row = reviewOne(baseline());
    expect(row.status).toBe('no_data');
    expect(row.change).toBeNull();
    expect(row.thisWeek.sessions).toBe(0);
  });

  it('incomplete: too little of this week has an rpe, and no change is computed', () => {
    const row = reviewOne([...baseline(), entry('2026-11-24', 60, null)]);
    expect(row.status).toBe('incomplete');
    expect(row.change).toBeNull();
    expect(row.baselineMean).toBe(100);
  });

  it('no_baseline: fewer usable previous weeks than required', () => {
    const row = reviewOne([entry('2026-11-16', 10, 10), entry('2026-11-24', 10, 10)]);
    expect(row.status).toBe('no_baseline');
    expect(row.baselineMean).toBeNull();
    expect(row.change).toBeNull();
  });

  it('no_baseline: previous weeks that are themselves incomplete are not usable', () => {
    const entries = [
      entry('2026-11-02', 10, 10),
      entry('2026-11-09', 10, null),
      entry('2026-11-16', 10, null),
      entry('2026-11-24', 10, 10),
    ];
    expect(reviewOne(entries).status).toBe('no_baseline');
  });

  it('no_baseline: a baseline of pure rest gives no ratio', () => {
    const row = reviewOne([entry('2026-10-26', 10, 10), entry('2026-11-24', 10, 10)], {
      minBaselineWeeks: 1,
    });
    expect(row.baselineMean).toBe(0);
    expect(row.change).toBeNull();
    expect(row.status).toBe('no_baseline');
  });

  it('steady: the same load as the baseline', () => {
    const row = reviewOne([...baseline(), entry('2026-11-24', 10, 10)]);
    expect(row).toMatchObject({ status: 'steady', change: 1, baselineMean: 100 });
  });

  it('sharp_increase: at or above the ratio, inclusive', () => {
    const exactly = reviewOne([...baseline(), entry('2026-11-24', 13, 10)]);
    expect(exactly.change).toBe(1.3);
    expect(exactly.status).toBe('sharp_increase');
    const just = reviewOne([...baseline(), entry('2026-11-24', 12.9, 10)]);
    expect(just.status).toBe('steady');
  });

  it('respects configured thresholds', () => {
    const entries = [...baseline(), entry('2026-11-24', 12, 10)];
    expect(reviewOne(entries).status).toBe('steady');
    expect(reviewOne(entries, { spikeRatio: 1.1 }).status).toBe('sharp_increase');
    expect(reviewOne(entries, { minBaselineWeeks: 4 }).status).toBe('no_baseline');
  });

  it('counts a genuine rest week as zero load in the baseline', () => {
    const entries = [
      entry('2026-11-02', 10, 10),
      entry('2026-11-16', 10, 10),
      entry('2026-11-24', 10, 10),
    ];
    const row = reviewOne(entries);
    expect(row.baselineMean).toBeCloseTo(200 / 3, 12);
    expect(row.status).toBe('sharp_increase');
  });

  it('never looks ahead of asOf', () => {
    const row = reviewOne([
      ...baseline(),
      entry('2026-11-24', 10, 10),
      entry('2026-11-26', 500, 10),
    ]);
    expect(row.thisWeek.minutes).toBe(10);
    expect(reviewLoad([entry('2026-11-30', 10, 5)], { asOf: AS_OF })).toEqual([]);
  });

  it('reports each player separately and in order', () => {
    const rows = reviewLoad([...baseline('b'), ...baseline('a')], { asOf: AS_OF });
    expect(rows.map((row) => row.playerId)).toEqual(['a', 'b']);
  });

  it('rejects bad options and bad input', () => {
    expect(() => reviewLoad([], { asOf: '2026-99-99' })).toThrow(EngineError);
    expect(() => reviewLoad([], { asOf: AS_OF, spikeRatio: 0 })).toThrow(EngineError);
    expect(() => reviewLoad([], { asOf: AS_OF, spikeRatio: Number.POSITIVE_INFINITY })).toThrow(
      EngineError,
    );
    expect(() => reviewLoad([], { asOf: AS_OF, minBaselineWeeks: 0 })).toThrow(EngineError);
    expect(() => reviewLoad([], { asOf: AS_OF, minBaselineWeeks: 1.5 })).toThrow(EngineError);
    expect(() => reviewLoad([], { asOf: AS_OF, minRatedShare: 1.5 })).toThrow(EngineError);
    expect(() => reviewLoad([entry('2026-11-02', 10, 12)], { asOf: AS_OF })).toThrow(EngineError);
  });
});

describe('reviewLoad consecutiveDays', () => {
  it('finds the longest run in the 7 days ending at asOf', () => {
    const days = ['2026-11-19', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-25'];
    const row = reviewOne(days.map((date) => entry(date, 30, 5)));
    expect(row.consecutiveDays).toBe(3);
  });

  it('ignores days outside the window and counts two entries on one day once', () => {
    const row = reviewOne([
      entry('2026-11-18', 30, 5),
      entry('2026-11-25', 30, 5),
      entry('2026-11-25', 20, 5),
    ]);
    expect(row.consecutiveDays).toBe(1);
  });
});

const entryArb = fc.record({
  playerId: fc.constantFrom('a', 'b', 'c'),
  day: fc.integer({ min: 0, max: 120 }),
  minutes: fc.integer({ min: 0, max: 200 }),
  rpe: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
  kind: fc.constantFrom('match' as const, 'session' as const),
});

const entriesArb = fc.array(entryArb, { maxLength: 40 }).map((rows): LoadEntry[] =>
  rows.map(({ day, ...rest }) => ({
    ...rest,
    date: new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10),
  })),
);

describe('load properties', () => {
  it('conserves total minutes across weeks and splits them into rated and unrated', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const rows = weeklyLoad(entries);
        const total = entries.reduce((sum, row) => sum + row.minutes, 0);
        expect(rows.reduce((sum, row) => sum + row.minutes, 0)).toBe(total);
        for (const row of rows) expect(row.ratedMinutes + row.unratedMinutes).toBe(row.minutes);
      }),
    );
  });

  it('gives the same review for the same records, whatever their order', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const options = { asOf: '2026-03-15' };
        const first = reviewLoad(entries, options);
        expect(reviewLoad(entries, options)).toEqual(first);
        expect(reviewLoad([...entries].reverse(), options)).toEqual(first);
      }),
    );
  });

  it('never raises load when an unrated entry is added', () => {
    fc.assert(
      fc.property(entriesArb, entryArb, (entries, extra) => {
        const unrated: LoadEntry = {
          playerId: extra.playerId,
          date: '2026-02-10',
          minutes: extra.minutes,
          rpe: null,
          kind: extra.kind,
        };
        const sum = (rows: readonly { load: number }[]): number =>
          rows.reduce((total, row) => total + row.load, 0);
        expect(sum(weeklyLoad([...entries, unrated]))).toBeLessThanOrEqual(
          sum(weeklyLoad(entries)),
        );
      }),
    );
  });

  it('always returns exactly one known status per player seen up to asOf', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const statuses = ['no_data', 'incomplete', 'no_baseline', 'sharp_increase', 'steady'];
        const rows = reviewLoad(entries, { asOf: '2026-03-15' });
        for (const row of rows) {
          expect(statuses).toContain(row.status);
          expect(row.change === null).toBe(
            row.status !== 'sharp_increase' && row.status !== 'steady',
          );
        }
      }),
    );
  });
});
