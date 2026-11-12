import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EVENT_KINDS } from '../matches/weights';
import { LATEST_COUNT, LIVE_MEASURES, liveSnapshot, nowVerdict } from './liveModel';
import type { ReviewEvent } from './reviewModel';

let next = 0;
function event(overrides: Partial<ReviewEvent>): ReviewEvent {
  next += 1;
  return {
    id: `event-${String(next)}`,
    period: 1,
    clock_seconds: 0,
    side: 'home',
    kind: 'corner',
    weight: 250,
    x: null,
    y: null,
    ...overrides,
  };
}

describe('liveSnapshot', () => {
  it('is empty and makes no claim before anything is recorded', () => {
    const snapshot = liveSnapshot([]);
    expect(snapshot.clockSeconds).toBeNull();
    expect(snapshot.period).toBe(1);
    expect(snapshot.reading).toBeNull();
    expect(snapshot.latest).toEqual([]);
    for (const measure of LIVE_MEASURES) {
      expect(snapshot.numbers.home[measure]).toBe(0);
      expect(snapshot.numbers.away[measure]).toBe(0);
    }
    expect(nowVerdict(snapshot.reading)).toBe('insufficient');
  });

  it('counts each side, with goals as shots on target and chance quality from shots only', () => {
    const snapshot = liveSnapshot([
      event({ kind: 'goal', weight: 3200, clock_seconds: 60 }),
      event({ kind: 'shot_on_target', weight: 900, clock_seconds: 120 }),
      event({ kind: 'shot_off_target', weight: 400, clock_seconds: 180 }),
      event({ kind: 'big_chance', weight: 3500, clock_seconds: 200 }),
      event({ kind: 'box_entry', weight: 300, clock_seconds: 210 }),
      event({ kind: 'corner', weight: 250, clock_seconds: 220 }),
      event({ kind: 'high_recovery', weight: 150, clock_seconds: 230 }),
      event({ kind: 'shot_on_target', weight: 700, clock_seconds: 240, side: 'away' }),
      event({ kind: 'lost_ball_own_half', weight: 150, clock_seconds: 250, side: 'away' }),
    ]);
    expect(snapshot.numbers.home).toEqual({
      goals: 1,
      shots: 3,
      onTarget: 2,
      units: 4500,
      bigChances: 1,
      boxEntries: 1,
      corners: 1,
      highRecoveries: 1,
    });
    expect(snapshot.numbers.away.shots).toBe(1);
    expect(snapshot.numbers.away.units).toBe(700);
    expect(snapshot.numbers.away.goals).toBe(0);
  });

  it('takes the newest event as "now", across periods, and lists the newest first', () => {
    const first = event({ period: 1, clock_seconds: 1700, kind: 'corner' });
    const second = event({ period: 2, clock_seconds: 30, kind: 'box_entry' });
    const third = event({ period: 2, clock_seconds: 95, kind: 'goal', weight: 2500 });
    const snapshot = liveSnapshot([first, second, third]);
    expect(snapshot.period).toBe(2);
    expect(snapshot.clockSeconds).toBe(95);
    expect(snapshot.latest.map((entry) => entry.id)).toEqual([third.id, second.id, first.id]);
    expect(snapshot.reading?.period).toBe(2);
    expect(snapshot.reading?.t).toBe(95);
  });

  it('puts the later of two events at the same second first', () => {
    const earlier = event({ clock_seconds: 40 });
    const later = event({ clock_seconds: 40 });
    expect(liveSnapshot([earlier, later]).latest[0]?.id).toBe(later.id);
  });

  it('says a side is on top only when the engine names one', () => {
    const oneSided = liveSnapshot([
      event({ kind: 'goal', weight: 4000, clock_seconds: 500 }),
      event({ kind: 'shot_on_target', weight: 2500, clock_seconds: 520 }),
      event({ kind: 'big_chance', weight: 3500, clock_seconds: 540 }),
    ]);
    expect(oneSided.reading?.favoured).toBe('home');
    expect(nowVerdict(oneSided.reading)).toBe('favoured');

    const even = liveSnapshot([
      event({ kind: 'shot_on_target', weight: 1000, clock_seconds: 500 }),
      event({ kind: 'shot_on_target', weight: 1000, clock_seconds: 500, side: 'away' }),
    ]);
    expect(even.reading?.favoured).toBeNull();
    expect(['level', 'unclear']).toContain(nowVerdict(even.reading));
  });

  it('never lists more than the newest few, and its counts never exceed the events', () => {
    const anyEvent = fc.record({
      period: fc.integer({ min: 1, max: 4 }),
      clock_seconds: fc.integer({ min: 0, max: 3000 }),
      side: fc.constantFrom<'home' | 'away'>('home', 'away'),
      kind: fc.constantFrom(...EVENT_KINDS),
      weight: fc.integer({ min: 0, max: 9000 }),
    });
    fc.assert(
      fc.property(fc.array(anyEvent, { maxLength: 60 }), (rows) => {
        const events = rows.map((row) => event(row));
        const snapshot = liveSnapshot(events);
        expect(snapshot.latest.length).toBe(Math.min(LATEST_COUNT, events.length));
        const { home, away } = snapshot.numbers;
        expect(home.shots + away.shots).toBeLessThanOrEqual(events.length);
        expect(home.onTarget).toBeLessThanOrEqual(home.shots);
        expect(away.onTarget).toBeLessThanOrEqual(away.shots);
        expect(home.goals).toBeLessThanOrEqual(home.onTarget);
        const newest = snapshot.latest[0];
        if (newest !== undefined) {
          for (const other of events) {
            expect(
              other.period < newest.period ||
                (other.period === newest.period && other.clock_seconds <= newest.clock_seconds),
            ).toBe(true);
          }
        }
      }),
    );
  });
});
