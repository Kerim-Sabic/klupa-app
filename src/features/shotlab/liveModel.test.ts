import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../../engine/pose';
import {
  catchStrike,
  emptyRing,
  fasterFoot,
  frameNumbers,
  framesPerSecond,
  idleScheduler,
  isTooSlow,
  isTracking,
  NO_NUMBERS,
  pushFrame,
  recentCompletions,
  shouldInfer,
  smoothNumbers,
  smoothValue,
  type FrameRing,
} from './liveModel';
import { synthesizeKick } from './synthetic';

const fill = (frames: readonly PoseFrame[], ring: FrameRing = emptyRing()) =>
  frames.reduce(pushFrame, ring);

describe('frame ring', () => {
  it('keeps only the last three seconds, oldest first', () => {
    const ring = fill(synthesizeKick({ duration: 5 }));
    const first = ring.frames[0];
    const last = ring.frames[ring.frames.length - 1];
    expect(last?.time).toBeCloseTo(149 / 30);
    expect((last?.time ?? 0) - (first?.time ?? 0)).toBeLessThanOrEqual(3);
    // 90 or 91 frames at 30 fps, depending on where the edge falls in floating point.
    expect(ring.frames.length).toBeGreaterThanOrEqual(90);
  });

  it('ignores a frame that is not newer than the last', () => {
    const ring = fill([{ time: 1, world: null }]);
    expect(pushFrame(ring, { time: 1, world: null })).toBe(ring);
    expect(pushFrame(ring, { time: 0.5, world: null })).toBe(ring);
  });

  it('never holds more than the window, whatever the timing (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.001, max: 0.5, noNaN: true }), {
          minLength: 1,
          maxLength: 200,
        }),
        (gaps) => {
          let time = 0;
          let ring = emptyRing();
          for (const gap of gaps) {
            time += gap;
            ring = pushFrame(ring, { time, world: null });
          }
          const times = ring.frames.map((f) => f.time);
          expect(times[times.length - 1]).toBeCloseTo(time);
          expect(time - (times[0] ?? time)).toBeLessThanOrEqual(3 + 1e-9);
          expect(times.every((t, i) => i === 0 || t > (times[i - 1] ?? 0))).toBe(true);
        },
      ),
    );
  });
});

describe('scheduling and rate', () => {
  it('runs one inference at a time and only on a new video frame', () => {
    expect(shouldInfer(idleScheduler, 0)).toBe(true);
    expect(shouldInfer({ busy: true, lastVideoTime: -1 }, 0.5)).toBe(false);
    expect(shouldInfer({ busy: false, lastVideoTime: 0.5 }, 0.5)).toBe(false);
    expect(shouldInfer({ busy: false, lastVideoTime: 0.5 }, 0.53)).toBe(true);
  });

  it('counts the frames finished in the last second', () => {
    let done: number[] = [];
    for (let t = 0; t <= 2000; t += 100) done = recentCompletions(done, t);
    expect(framesPerSecond(done, 2000)).toBe(10);
    expect(done.length).toBeLessThanOrEqual(11);
  });

  it('calls the device too slow only after a few seconds under five a second', () => {
    const slow = [0, 1000, 2000, 3000].map((t): [number, number] => [t, 3]);
    expect(isTooSlow(slow, 3000)).toBe(true);
    expect(isTooSlow(slow.slice(0, 2), 1000)).toBe(false);
    expect(isTooSlow([...slow.slice(0, 3), [3000, 12]], 3000)).toBe(false);
    expect(isTooSlow([], 9000)).toBe(false);
  });
});

describe('smoothing', () => {
  it('passes the first value, then moves part of the way', () => {
    expect(smoothValue(null, 10)).toBe(10);
    expect(smoothValue(10, 20)).toBeCloseTo(13);
    expect(smoothValue(10, null)).toBe(10);
    expect(smoothValue(10, Number.NaN)).toBe(10);
  });

  it('stays between the previous and the new value (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        (a, b) => {
          const s = smoothValue(a, b) ?? Number.NaN;
          expect(s).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-6);
          expect(s).toBeLessThanOrEqual(Math.max(a, b) + 1e-6);
        },
      ),
    );
  });
});

describe('tracking and numbers', () => {
  const frames = synthesizeKick();

  it('is lost with nobody in view or an unsure body', () => {
    expect(isTracking({ time: 0, world: null })).toBe(false);
    expect(isTracking(synthesizeKick({ visibility: 0.3 })[0] ?? { time: 0, world: null })).toBe(
      false,
    );
    expect(isTracking(frames[0] ?? { time: 0, world: null })).toBe(true);
  });

  it('reads knees, trunk and foot speed per frame, and nothing when lost', () => {
    const [a, b] = [frames[38], frames[39]];
    if (a === undefined || b === undefined) throw new Error('frames');
    const numbers = frameNumbers(a, b);
    expect(numbers.rightKnee).toBeGreaterThan(100);
    expect(numbers.leftKnee).toBeGreaterThan(100);
    expect(numbers.trunkLean).toBeCloseTo(4, 0);
    expect(numbers.rightFootSpeed).toBeGreaterThan(5);
    expect(fasterFoot(numbers)).toBe('right');
    expect(frameNumbers(undefined, b).rightFootSpeed).toBeNull();
    expect(frameNumbers(a, { time: 2, world: null })).toBe(NO_NUMBERS);
  });

  it('keeps the last numbers while tracking is lost', () => {
    const shown = { ...NO_NUMBERS, leftKnee: 150 };
    expect(smoothNumbers(shown, NO_NUMBERS).leftKnee).toBe(150);
    expect(fasterFoot({ ...NO_NUMBERS, leftFootSpeed: 0.1, rightFootSpeed: 0.2 })).toBeNull();
    expect(fasterFoot({ ...NO_NUMBERS, leftFootSpeed: 2, rightFootSpeed: 1 })).toBe('left');
    expect(fasterFoot(NO_NUMBERS)).toBeNull();
  });
});

describe('catching a strike live', () => {
  // A kick at 3.3 s on the live clock, seen frame by frame as a camera would deliver it.
  const live = synthesizeKick({ duration: 5, strikeTime: 3.3 });

  function replay(frames: readonly PoseFrame[]) {
    let ring = emptyRing();
    let caught: ReturnType<typeof catchStrike> = null;
    const catches: number[] = [];
    for (const frame of frames) {
      ring = pushFrame(ring, frame);
      const next = catchStrike(ring, caught);
      if (next !== null) {
        caught = next;
        catches.push(frame.time);
      }
    }
    return { caught, catches };
  }

  it('freezes the window once, after the follow-through, with times from zero', () => {
    const { caught, catches } = replay(live);
    expect(catches).toHaveLength(1);
    expect(catches[0]).toBeGreaterThanOrEqual(3.8 - 1e-9);
    expect(caught?.analysis.foot).toBe('right');
    expect(caught?.at).toBeCloseTo(3.3, 1);
    expect(caught?.frames[0]?.time).toBe(0);
    expect(caught?.frames.length).toBeLessThanOrEqual(91);
  });

  it('catches nothing from a figure standing still', () => {
    expect(replay(synthesizeKick({ still: true, duration: 5 })).catches).toEqual([]);
    expect(catchStrike(emptyRing(), null)).toBeNull();
  });

  it('finds the strike wherever it falls in the stream (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.5, max: 4, noNaN: true }), (strikeTime) => {
        const { caught } = replay(synthesizeKick({ duration: 5, strikeTime }));
        expect(caught?.at).toBeCloseTo(strikeTime, 1);
      }),
      { numRuns: 15 },
    );
  });
});
