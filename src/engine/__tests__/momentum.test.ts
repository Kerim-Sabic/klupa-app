import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assessWindow,
  compareWindows,
  decimalToUnits,
  momentumSeries,
  readMomentum,
  summariseSeries,
} from '../momentum';
import { EngineError, type EvidenceEvent, type Side } from '../types';

let nextId = 0;
function shot(t: number, side: Side, weight: number, period = 1): EvidenceEvent {
  nextId += 1;
  return { id: `e${String(nextId)}`, period, t, side, weight };
}

const eventArbitrary = fc.record({
  id: fc.uuid(),
  period: fc.constant(1),
  t: fc.integer({ min: 0, max: 2700 }),
  side: fc.constantFrom<Side>('home', 'away'),
  weight: fc.integer({ min: 0, max: 10_000 }),
});

describe('readMomentum', () => {
  it('reports insufficient evidence when nothing was observed', () => {
    const reading = readMomentum([], 1, 600);
    expect(reading.state).toBe('insufficient');
    expect(reading.favoured).toBeNull();
  });

  it('uses windows that are open on the left and closed on the right', () => {
    const events = [shot(120, 'home', 500)];
    expect(readMomentum(events, 1, 300).windows[0]?.events).toHaveLength(0); // (120, 300]
    expect(readMomentum(events, 1, 299).windows[0]?.events).toHaveLength(1); // (119, 299]
    expect(readMomentum(events, 1, 120).windows[0]?.events).toHaveLength(1); // closed right
    expect(readMomentum(events, 1, 119).windows[0]?.events).toHaveLength(0); // no look-ahead
  });

  it('resets at each period and ignores other periods', () => {
    const events = [shot(2600, 'home', 900, 1)];
    expect(readMomentum(events, 2, 30).state).toBe('insufficient');
  });

  it('does not trust input order', () => {
    const ordered = [shot(100, 'home', 300), shot(200, 'away', 100), shot(250, 'home', 50)];
    const reversed = [...ordered].reverse();
    expect(readMomentum(reversed, 1, 300)).toEqual(readMomentum(ordered, 1, 300));
  });

  it('is level when evidence cancels out exactly', () => {
    const reading = readMomentum([shot(10, 'home', 400), shot(20, 'away', 400)], 1, 60);
    expect(reading.state).toBe('level');
  });

  it('is window-sensitive when short and long views disagree', () => {
    const events = [shot(60, 'away', 900), shot(500, 'home', 300)];
    const reading = readMomentum(events, 1, 600);
    expect(reading.windows.map((window) => window.lean)).toEqual([1, 1, -1]);
    expect(reading.state).toBe('window-sensitive');
    expect(reading.favoured).toBeNull();
    expect(reading.opposed).toBe(true);
  });

  it('separates an empty short window from windows that oppose each other', () => {
    const reading = readMomentum([shot(100, 'home', 500)], 1, 600);
    expect(reading.windows.map((window) => window.lean)).toEqual([0, 0, 1]);
    expect(reading.state).toBe('window-sensitive');
    expect(reading.opposed).toBe(false);
  });

  it('is event-sensitive when one chance carries every window', () => {
    const reading = readMomentum([shot(590, 'home', 800)], 1, 600);
    expect(reading.state).toBe('event-sensitive');
    expect(reading.favoured).toBe('home');
    expect(reading.windows.every((window) => window.canTie)).toBe(true);
  });

  it('is stable only when no single event can change any window', () => {
    const events = [shot(450, 'away', 300), shot(500, 'away', 300), shot(550, 'away', 300)];
    const reading = readMomentum(events, 1, 600);
    expect(reading.state).toBe('stable');
    expect(reading.favoured).toBe('away');
  });

  it('names the event that matters most', () => {
    const events = [shot(500, 'home', 100), shot(520, 'home', 700), shot(540, 'away', 200)];
    const window = readMomentum(events, 1, 600).windows[0];
    expect(window?.decisiveEventId).toBe(events[1]?.id);
    expect(window?.canReverse).toBe(true);
  });

  it('rejects invalid input with stable error codes', () => {
    const code = (run: () => unknown): string => {
      try {
        run();
      } catch (error) {
        if (error instanceof EngineError) return error.code;
      }
      return 'NO_ERROR';
    };
    expect(code(() => readMomentum([shot(1, 'home', -1)], 1, 10))).toBe('INVALID_EVENT');
    expect(code(() => readMomentum([shot(1, 'home', 0.5)], 1, 10))).toBe('INVALID_EVENT');
    expect(code(() => readMomentum([shot(-1, 'home', 1)], 1, 10))).toBe('INVALID_EVENT');
    expect(code(() => readMomentum([shot(1, 'home', 1, 0)], 1, 10))).toBe('INVALID_EVENT');
    expect(code(() => readMomentum([], 1, -5))).toBe('INVALID_GRID');
    expect(code(() => readMomentum([], 1, 10, []))).toBe('INVALID_WINDOW');
    expect(code(() => readMomentum([], 1, 10, [300, 180]))).toBe('INVALID_WINDOW');
    expect(code(() => momentumSeries([], 1, 10.5))).toBe('INVALID_GRID');
    expect(code(() => momentumSeries([], 1, 10, 0))).toBe('INVALID_GRID');
    expect(code(() => compareWindows(momentumSeries([], 1, 10), 180, 999))).toBe('INVALID_WINDOW');
  });
});

describe('momentumSeries and summaries', () => {
  it('covers the grid from 0 to the duration inclusive', () => {
    const series = momentumSeries([], 1, 20, 5);
    expect(series.map((reading) => reading.t)).toEqual([0, 5, 10, 15, 20]);
  });

  it('counts every reading in exactly one state', () => {
    fc.assert(
      fc.property(fc.array(eventArbitrary, { maxLength: 30 }), (events) => {
        const summary = summariseSeries(momentumSeries(events, 1, 2700, 60));
        const total = Object.values(summary.byState).reduce((sum, count) => sum + count, 0);
        expect(total).toBe(summary.grid);
        expect(summary.agreementRobust + summary.agreementCanReverse).toBeLessThanOrEqual(
          summary.agreement,
        );
      }),
    );
  });
});

describe('assessWindow properties', () => {
  it('matches exhaustive single-event deletion', () => {
    fc.assert(
      fc.property(fc.array(eventArbitrary, { maxLength: 12 }), (events) => {
        const assessed = assessWindow(events, 600);
        const leansAfterDeletion = events.map(
          (_, index) =>
            assessWindow(
              events.filter((__, other) => other !== index),
              600,
            ).lean,
        );
        if (assessed.lean === 0) {
          expect(assessed.robust || assessed.canReverse || assessed.canTie).toBe(false);
          return;
        }
        expect(assessed.robust).toBe(leansAfterDeletion.every((lean) => lean === assessed.lean));
        expect(assessed.canReverse).toBe(leansAfterDeletion.includes(-assessed.lean as -1 | 1));
      }),
    );
  });

  it('mirrors when the sides are swapped', () => {
    fc.assert(
      fc.property(fc.array(eventArbitrary, { maxLength: 20 }), (events) => {
        const swapped = events.map((event) => ({
          ...event,
          side: event.side === 'home' ? ('away' as const) : ('home' as const),
        }));
        const original = readMomentum(events, 1, 2700);
        const mirrored = readMomentum(swapped, 1, 2700);
        expect(mirrored.state).toBe(original.state);
        expect(mirrored.windows.map((window) => window.differential)).toEqual(
          original.windows.map((window) => (window.differential === 0 ? 0 : -window.differential)),
        );
      }),
    );
  });

  it('never looks ahead: later events cannot change an earlier reading', () => {
    fc.assert(
      fc.property(
        fc.array(eventArbitrary, { maxLength: 20 }),
        fc.integer({ min: 0, max: 2700 }),
        (events, t) => {
          const past = events.filter((event) => event.t <= t);
          expect(readMomentum(events, 1, t)).toEqual(readMomentum(past, 1, t));
        },
      ),
    );
  });
});

describe('decimalToUnits', () => {
  it('converts provider decimals exactly', () => {
    expect(decimalToUnits('0.0375')).toBe(375);
    expect(decimalToUnits('0.1')).toBe(1000);
    expect(decimalToUnits('1')).toBe(10_000);
    expect(decimalToUnits('0.29', 2)).toBe(29);
  });

  it('rejects anything that is not a plain non-negative decimal', () => {
    for (const value of ['', '-0.1', '1e-3', '0.12345', 'abc', '.5', '99999999999999999999']) {
      expect(() => decimalToUnits(value)).toThrow(EngineError);
    }
  });
});
