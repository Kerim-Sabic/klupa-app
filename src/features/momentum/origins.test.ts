import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MIN_CHANCES_FOR_PATTERN,
  ORIGINS,
  ORIGIN_WINDOW_SECONDS,
  chanceOrigins,
  originOf,
} from './origins';
import type { ReviewEvent } from './reviewModel';

let serial = 0;
function ev(overrides: Partial<ReviewEvent>): ReviewEvent {
  serial += 1;
  return {
    id: `e${String(serial)}`,
    period: 1,
    clock_seconds: 0,
    side: 'home',
    kind: 'shot_on_target',
    weight: 1000,
    x: null,
    y: null,
    ...overrides,
  };
}

describe('originOf', () => {
  it('reads a shot after the shooting side won the ball high as pressing', () => {
    const win = ev({ kind: 'high_recovery', clock_seconds: 100 });
    const shot = ev({ clock_seconds: 112 });
    expect(originOf(shot, [win, shot])).toBe('pressing');
  });

  it('reads a shot after the other side lost the ball in its own half as a turnover', () => {
    const loss = ev({ side: 'away', kind: 'lost_ball_own_half', clock_seconds: 100 });
    const shot = ev({ clock_seconds: 120 });
    expect(originOf(shot, [loss, shot])).toBe('turnover');
    // The same loss is no lead-up for the side that lost it.
    const theirShot = ev({ side: 'away', clock_seconds: 120 });
    expect(originOf(theirShot, [loss, theirShot])).toBe('other');
  });

  it('reads a shot after the shooting side had a corner as a corner chance', () => {
    const corner = ev({ side: 'away', kind: 'corner', clock_seconds: 300 });
    const shot = ev({ side: 'away', kind: 'goal', clock_seconds: 308 });
    expect(originOf(shot, [corner, shot])).toBe('corner');
    const ours = ev({ clock_seconds: 308 });
    expect(originOf(ours, [corner, ours])).toBe('other');
  });

  it('counts only what was tagged in the half-minute before, in the same period', () => {
    const win = ev({ kind: 'high_recovery', clock_seconds: 100 });
    const onTheEdge = ev({ clock_seconds: 100 + ORIGIN_WINDOW_SECONDS });
    const tooLate = ev({ clock_seconds: 101 + ORIGIN_WINDOW_SECONDS });
    const before = ev({ clock_seconds: 99 });
    const nextPeriod = ev({ period: 2, clock_seconds: 105 });
    const all = [win, onTheEdge, tooLate, before, nextPeriod];
    expect(originOf(onTheEdge, all)).toBe('pressing');
    expect(originOf(tooLate, all)).toBe('other');
    expect(originOf(before, all)).toBe('other');
    expect(originOf(nextPeriod, all)).toBe('other');
  });

  it('takes the latest lead-up, and the display order when two share a second', () => {
    const corner = ev({ kind: 'corner', clock_seconds: 100 });
    const win = ev({ kind: 'high_recovery', clock_seconds: 110 });
    const shot = ev({ clock_seconds: 115 });
    expect(originOf(shot, [corner, win, shot])).toBe('pressing');
    expect(originOf(shot, [win, corner, shot])).toBe('pressing');

    const loss = ev({ side: 'away', kind: 'lost_ball_own_half', clock_seconds: 200 });
    const sameSecondWin = ev({ kind: 'high_recovery', clock_seconds: 200 });
    const later = ev({ clock_seconds: 205 });
    expect(originOf(later, [loss, sameSecondWin, later])).toBe('pressing');
    expect(originOf(later, [sameSecondWin, loss, later])).toBe('pressing');
  });

  it('does not treat another shot, or the shot itself, as a lead-up', () => {
    const first = ev({ clock_seconds: 50 });
    const rebound = ev({ kind: 'goal', clock_seconds: 53 });
    expect(originOf(rebound, [first, rebound])).toBe('other');
  });
});

describe('chanceOrigins', () => {
  const loss = (clock: number) =>
    ev({ side: 'home', kind: 'lost_ball_own_half', clock_seconds: clock, weight: 150 });

  it('adds up chances, goals and chance quality per lead-up for each side', () => {
    const events = [
      loss(100),
      ev({ side: 'away', kind: 'goal', clock_seconds: 110, weight: 3000 }),
      loss(400),
      ev({ side: 'away', kind: 'shot_off_target', clock_seconds: 420, weight: 500 }),
      ev({ side: 'away', kind: 'corner', clock_seconds: 700, weight: 250 }),
      ev({ side: 'away', kind: 'shot_on_target', clock_seconds: 705, weight: 900 }),
      ev({ side: 'home', kind: 'big_chance', clock_seconds: 900, weight: 3500 }),
    ];
    const { home, away } = chanceOrigins(events);
    expect(away).toMatchObject({ side: 'away', chances: 3, goals: 1, units: 4400 });
    expect(away.rows.map((row) => row.origin)).toEqual(ORIGINS);
    expect(away.rows.find((row) => row.origin === 'turnover')).toEqual({
      origin: 'turnover',
      chances: 2,
      goals: 1,
      units: 3500,
    });
    expect(away.rows.find((row) => row.origin === 'corner')?.chances).toBe(1);
    expect(away.pattern?.origin).toBe('turnover');
    expect(home).toMatchObject({ chances: 1, goals: 0, units: 3500, pattern: null });
    expect(home.rows.find((row) => row.origin === 'other')?.chances).toBe(1);
  });

  it('names no pattern from too few chances, or when no lead-up is behind half of them', () => {
    const two = [loss(10), ev({ side: 'away', clock_seconds: 15 }), loss(60)];
    expect(chanceOrigins(two).away.chances).toBeLessThan(MIN_CHANCES_FOR_PATTERN);
    expect(chanceOrigins(two).away.pattern).toBeNull();

    const spread = [
      loss(10),
      ev({ side: 'away', clock_seconds: 15 }),
      ev({ side: 'away', clock_seconds: 200 }),
      ev({ side: 'away', clock_seconds: 400 }),
      ev({ side: 'away', clock_seconds: 600 }),
    ];
    expect(chanceOrigins(spread).away.pattern).toBeNull();
  });

  it('never calls untagged build-up a pattern', () => {
    const untagged = Array.from({ length: 5 }, (_, index) =>
      ev({ side: 'away', clock_seconds: 100 * (index + 1) }),
    );
    const { away } = chanceOrigins(untagged);
    expect(away.rows.find((row) => row.origin === 'other')?.chances).toBe(5);
    expect(away.pattern).toBeNull();
  });

  it('is empty for no events', () => {
    const { home, away } = chanceOrigins([]);
    for (const profile of [home, away]) {
      expect(profile).toMatchObject({ chances: 0, goals: 0, units: 0, pattern: null });
      expect(profile.rows).toHaveLength(4);
    }
  });

  it('accounts for every shot exactly once, whatever the order of the events (property)', () => {
    const kinds = [
      'goal',
      'shot_on_target',
      'shot_off_target',
      'big_chance',
      'box_entry',
      'corner',
      'high_recovery',
      'lost_ball_own_half',
    ] as const;
    const event = fc.record({
      period: fc.integer({ min: 1, max: 2 }),
      clock_seconds: fc.integer({ min: 0, max: 1800 }),
      side: fc.constantFrom('home' as const, 'away' as const),
      kind: fc.constantFrom(...kinds),
      weight: fc.integer({ min: 0, max: 10_000 }),
    });
    fc.assert(
      fc.property(fc.array(event, { maxLength: 60 }), (rows) => {
        const events = rows.map((row, index) => ({ ...ev(row), id: `p${String(index)}` }));
        const shots = events.filter(
          (e) => !['box_entry', 'corner', 'high_recovery', 'lost_ball_own_half'].includes(e.kind),
        );
        const forward = chanceOrigins(events);
        const backward = chanceOrigins([...events].reverse());
        expect(backward).toEqual(forward);
        expect(forward.home.chances + forward.away.chances).toBe(shots.length);
        expect(forward.home.units + forward.away.units).toBe(
          shots.reduce((sum, shot) => sum + shot.weight, 0),
        );
        for (const profile of [forward.home, forward.away]) {
          expect(profile.rows.reduce((sum, row) => sum + row.chances, 0)).toBe(profile.chances);
          if (profile.pattern !== null) {
            expect(profile.pattern.chances * 2).toBeGreaterThanOrEqual(profile.chances);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
