import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPEED,
  atFullTime,
  crossed,
  initialPlayback,
  keyAction,
  playbackReducer,
  type PlaybackAction,
} from './playback';

const TOTAL = 5400;

describe('playbackReducer', () => {
  it('opens at full time, paused', () => {
    const state = initialPlayback(TOTAL);
    expect(state).toEqual({ playhead: TOTAL, playing: false, speed: DEFAULT_SPEED, total: TOTAL });
    expect(atFullTime(state)).toBe(true);
  });

  it('watching as live restarts from kick-off, playing unless told not to', () => {
    const state = initialPlayback(TOTAL);
    expect(playbackReducer(state, { type: 'watchLive', autoplay: true })).toMatchObject({
      playhead: 0,
      playing: true,
    });
    expect(playbackReducer(state, { type: 'watchLive', autoplay: false }).playing).toBe(false);
  });

  it('advances by wall time times speed, and stops at the final whistle', () => {
    let state = playbackReducer(initialPlayback(TOTAL), { type: 'watchLive', autoplay: true });
    state = playbackReducer(state, { type: 'speed', speed: 60 });
    state = playbackReducer(state, { type: 'tick', ms: 1000 });
    expect(state.playhead).toBe(60);
    state = playbackReducer(state, { type: 'tick', ms: -50 });
    expect(state.playhead).toBe(60);
    state = playbackReducer(state, { type: 'tick', ms: 10_000_000 });
    expect(state).toMatchObject({ playhead: TOTAL, playing: false });
    const paused = playbackReducer({ ...state, playhead: 10 }, { type: 'tick', ms: 1000 });
    expect(paused.playhead).toBe(10);
  });

  it('toggles, steps, seeks and cycles speed within the match', () => {
    let state = { ...initialPlayback(TOTAL), playhead: 100 };
    state = playbackReducer(state, { type: 'toggle' });
    expect(state.playing).toBe(true);
    state = playbackReducer(state, { type: 'toggle' });
    expect(state.playing).toBe(false);
    expect(playbackReducer(state, { type: 'pause' })).toBe(state);
    expect(playbackReducer(state, { type: 'step', seconds: -500 }).playhead).toBe(0);
    expect(playbackReducer(state, { type: 'seek', playhead: 9e9 }).playhead).toBe(TOTAL);
    expect(playbackReducer(state, { type: 'seek', playhead: Number.NaN }).playhead).toBe(100);
    expect(playbackReducer(state, { type: 'fullMatch' })).toMatchObject({ playhead: TOTAL });
    const speeds = [state.speed];
    for (let i = 0; i < 4; i += 1) {
      state = playbackReducer(state, { type: 'nextSpeed' });
      speeds.push(state.speed);
    }
    expect(speeds).toEqual([30, 60, 1, 10, 30]);
    expect(playbackReducer({ ...state, playhead: TOTAL }, { type: 'play' }).playhead).toBe(0);
  });

  it('never leaves the match, whatever happens', () => {
    const action: fc.Arbitrary<PlaybackAction> = fc.oneof(
      fc.record({
        type: fc.constant('tick' as const),
        ms: fc.integer({ min: -1000, max: 100_000 }),
      }),
      fc.constant({ type: 'toggle' as const }),
      fc.record({
        type: fc.constant('step' as const),
        seconds: fc.integer({ min: -9000, max: 9000 }),
      }),
      fc.record({
        type: fc.constant('seek' as const),
        playhead: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      }),
      fc.constant({ type: 'nextSpeed' as const }),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        const end = actions.reduce(playbackReducer, initialPlayback(TOTAL));
        expect(end.playhead).toBeGreaterThanOrEqual(0);
        expect(end.playhead).toBeLessThanOrEqual(TOTAL);
      }),
    );
  });
});

describe('keyAction', () => {
  it('maps the scrubber keys', () => {
    expect(keyAction(' ', false)).toEqual({ type: 'toggle' });
    expect(keyAction('Spacebar', false)).toEqual({ type: 'toggle' });
    expect(keyAction('ArrowRight', false)).toEqual({ type: 'step', seconds: 10 });
    expect(keyAction('ArrowUp', true)).toEqual({ type: 'step', seconds: 60 });
    expect(keyAction('ArrowLeft', false)).toEqual({ type: 'step', seconds: -10 });
    expect(keyAction('ArrowDown', true)).toEqual({ type: 'step', seconds: -60 });
    expect(keyAction('Home', false)).toEqual({ type: 'seek', playhead: 0 });
    expect(keyAction('End', false)).toEqual({ type: 'fullMatch' });
    expect(keyAction('a', false)).toBeNull();
  });
});

describe('crossed', () => {
  it('finds the moments passed going forward only', () => {
    expect(crossed([10, 20, 30], 10, 30)).toEqual([1, 2]);
    expect(crossed([10, 20, 30], 30, 10)).toEqual([]);
  });
});
