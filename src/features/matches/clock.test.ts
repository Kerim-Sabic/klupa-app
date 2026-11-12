import { describe, expect, it } from 'vitest';
import {
  canRecord,
  clockKey,
  clockPhase,
  clockReducer,
  elapsedAt,
  formatClock,
  INITIAL_CLOCK,
  loadClock,
  MAX_CLOCK_SECONDS,
  parseClock,
  saveClock,
  secondsAt,
  type ClockAction,
  type ClockState,
} from './clock';

function run(actions: readonly ClockAction[], from: ClockState = INITIAL_CLOCK): ClockState {
  return actions.reduce(clockReducer, from);
}

describe('clockReducer', () => {
  it('starts the first period from kick-off', () => {
    const state = run([{ type: 'start', now: 1000 }]);
    expect(state).toEqual({
      period: 1,
      running: true,
      elapsedMs: 0,
      startedAt: 1000,
      ended: false,
    });
    expect(secondsAt(state, 61_999)).toBe(60);
  });

  it('ignores a second start once the match has begun', () => {
    const started = run([{ type: 'start', now: 0 }]);
    expect(clockReducer(started, { type: 'start', now: 5000 })).toBe(started);
  });

  it('pauses and resumes without counting the pause', () => {
    const state = run([
      { type: 'start', now: 0 },
      { type: 'pause', now: 30_000 },
      { type: 'resume', now: 90_000 },
    ]);
    expect(state.running).toBe(true);
    expect(secondsAt(state, 100_000)).toBe(40);
  });

  it('treats pause while paused and resume while running as no-ops', () => {
    const paused = run([
      { type: 'start', now: 0 },
      { type: 'pause', now: 1000 },
    ]);
    expect(clockReducer(paused, { type: 'pause', now: 2000 })).toBe(paused);
    const running = run([{ type: 'start', now: 0 }]);
    expect(clockReducer(running, { type: 'resume', now: 2000 })).toBe(running);
    expect(clockReducer(INITIAL_CLOCK, { type: 'resume', now: 2000 })).toBe(INITIAL_CLOCK);
  });

  it('ends a period at the exact clock and freezes it', () => {
    const ended = run([
      { type: 'start', now: 0 },
      { type: 'end', now: 25 * 60_000 + 400 },
    ]);
    expect(ended.ended).toBe(true);
    expect(ended.running).toBe(false);
    expect(secondsAt(ended, 99 * 60_000)).toBe(1500);
    expect(clockReducer(ended, { type: 'end', now: 1 })).toBe(ended);
    expect(clockReducer(ended, { type: 'resume', now: 1 })).toBe(ended);
    expect(clockReducer(INITIAL_CLOCK, { type: 'end', now: 1 })).toBe(INITIAL_CLOCK);
  });

  it('ends a paused period with the time played before the pause', () => {
    const state = run([
      { type: 'start', now: 0 },
      { type: 'pause', now: 10_000 },
      { type: 'end', now: 50_000 },
    ]);
    expect(secondsAt(state, 60_000)).toBe(10);
  });

  it('starts the next period at zero, only after the last one ended and only up to the count', () => {
    const half = run([
      { type: 'start', now: 0 },
      { type: 'end', now: 1_800_000 },
    ]);
    const second = clockReducer(half, { type: 'next', now: 2_000_000, periodCount: 2 });
    expect(second).toEqual({
      period: 2,
      running: true,
      elapsedMs: 0,
      startedAt: 2_000_000,
      ended: false,
    });
    expect(clockReducer(second, { type: 'next', now: 1, periodCount: 2 })).toBe(second);
    const full = clockReducer(second, { type: 'end', now: 3_000_000 });
    expect(clockReducer(full, { type: 'next', now: 1, periodCount: 2 })).toBe(full);
    expect(clockReducer(full, { type: 'next', now: 1, periodCount: 9 }).period).toBe(3);
  });

  it('never runs past the fourth period, whatever the count says', () => {
    let state = run([{ type: 'start', now: 0 }]);
    for (let index = 0; index < 6; index += 1) {
      state = clockReducer(state, { type: 'end', now: index });
      state = clockReducer(state, { type: 'next', now: index, periodCount: 10 });
    }
    expect(state.period).toBe(4);
  });
});

describe('secondsAt and elapsedAt', () => {
  it('caps at two hours, the most the database accepts', () => {
    const state = run([{ type: 'start', now: 0 }]);
    expect(secondsAt(state, 10 * 3_600_000)).toBe(MAX_CLOCK_SECONDS);
  });

  it('never goes negative when the device clock moves backwards', () => {
    const state = run([{ type: 'start', now: 10_000 }]);
    expect(elapsedAt(state, 5000)).toBe(0);
    expect(secondsAt(state, 5000)).toBe(0);
  });
});

describe('clockPhase', () => {
  it('names every phase', () => {
    expect(clockPhase(INITIAL_CLOCK, 2)).toBe('before');
    const running = run([{ type: 'start', now: 0 }]);
    expect(clockPhase(running, 2)).toBe('running');
    expect(clockPhase(clockReducer(running, { type: 'pause', now: 1 }), 2)).toBe('paused');
    const ended = clockReducer(running, { type: 'end', now: 1 });
    expect(clockPhase(ended, 2)).toBe('break');
    expect(clockPhase(ended, 1)).toBe('over');
  });

  it('allows recording only inside a period', () => {
    expect(canRecord('running')).toBe(true);
    expect(canRecord('paused')).toBe(true);
    expect(canRecord('before')).toBe(false);
    expect(canRecord('break')).toBe(false);
    expect(canRecord('over')).toBe(false);
  });
});

describe('formatClock', () => {
  it('pads minutes and seconds', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(2699.9)).toBe('44:59');
    expect(formatClock(-3)).toBe('00:00');
  });
});

describe('clock persistence', () => {
  it('round-trips through localStorage per match', () => {
    const state = run([
      { type: 'start', now: 100 },
      { type: 'pause', now: 5100 },
    ]);
    expect(saveClock('m1', state)).toBe(true);
    expect(window.localStorage.getItem(clockKey('m1'))).not.toBeNull();
    expect(loadClock('m1')).toEqual(state);
    expect(loadClock('m2')).toEqual(INITIAL_CLOCK);
  });

  it('turns anything unreadable into a fresh clock', () => {
    expect(parseClock(null)).toBe(INITIAL_CLOCK);
    expect(parseClock('{not json')).toBe(INITIAL_CLOCK);
    expect(parseClock('{"period":1}')).toBe(INITIAL_CLOCK);
    const inconsistent = { period: 1, running: true, elapsedMs: 0, startedAt: null, ended: false };
    expect(parseClock(JSON.stringify(inconsistent))).toBe(INITIAL_CLOCK);
    const both = { period: 1, running: true, elapsedMs: 0, startedAt: 5, ended: true };
    expect(parseClock(JSON.stringify(both))).toBe(INITIAL_CLOCK);
  });

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadClock('m1', blocked)).toBe(INITIAL_CLOCK);
    expect(saveClock('m1', INITIAL_CLOCK, blocked)).toBe(false);
  });
});
