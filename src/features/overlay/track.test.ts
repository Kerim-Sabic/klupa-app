import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_TRACKER,
  feetOf,
  iou,
  shownTracks,
  stepTracker,
  TRACKER_DEFAULTS,
  type Detection,
  type TrackerState,
} from './track';

const DT = 1 / 15;
const person = (x: number, y: number, w = 0.05, h = 0.15): Detection => ({
  x,
  y,
  w,
  h,
  score: 0.8,
});

function play(frames: readonly Detection[][], from: TrackerState = EMPTY_TRACKER, dt = DT) {
  return frames.reduce((state, detections) => stepTracker(state, detections, dt), from);
}

const numbers = (state: TrackerState) => shownTracks(state).map((track) => track.number);
const numberAt = (state: TrackerState, x: number, y: number) =>
  shownTracks(state).find(
    (track) => Math.abs(track.box.x - x) < 0.03 && Math.abs(track.box.y - y) < 0.03,
  )?.number;

describe('iou', () => {
  it('is 1 for the same box, 0 for boxes apart, and the shared share in between', () => {
    const a = { x: 0, y: 0, w: 2, h: 2 };
    expect(iou(a, a)).toBe(1);
    expect(iou(a, { x: 1, y: 0, w: 2, h: 2 })).toBeCloseTo(1 / 3);
    expect(iou(a, { x: 2, y: 0, w: 2, h: 2 })).toBe(0);
    expect(iou(a, { x: 5, y: 5, w: 1, h: 1 })).toBe(0);
    expect(iou({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 })).toBe(0);
  });

  it('puts the feet at the middle of the bottom edge', () => {
    expect(feetOf({ x: 0.2, y: 0.1, w: 0.1, h: 0.3 })).toEqual({ x: 0.25, y: 0.4 });
  });
});

describe('stepTracker', () => {
  it('gives a player a number at the third sighting and keeps it as they move', () => {
    const walk = Array.from({ length: 30 }, (_, i) => [person(0.1 + i * 0.015, 0.4)]);
    expect(numbers(play(walk.slice(0, 2)))).toEqual([]);
    expect(numbers(play(walk.slice(0, 3)))).toEqual([1]);
    const end = play(walk);
    expect(end.tracks).toHaveLength(1);
    const [track] = end.tracks;
    expect(track?.id).toBe(1);
    expect(track?.number).toBe(1);
    expect(track?.hits).toBe(30);
    expect(track?.box.x).toBeCloseTo(0.1 + 29 * 0.015, 1);
    expect(track?.vx).toBeGreaterThan(0.15);
    expect(track?.trail).toHaveLength(TRACKER_DEFAULTS.trailPoints);
    expect(track?.trail.at(-1)).toEqual(feetOf(track?.box ?? person(0, 0)));
  });

  it('never numbers a one-frame ghost, and forgets it', () => {
    const state = play([[person(0.5, 0.5)], [], [], [], [], [], []]);
    expect(state.tracks).toEqual([]);
    // Ids are still never reused: the next arrival is not mistaken for the ghost.
    expect(play([[person(0.2, 0.2)]], state).tracks[0]?.id).toBe(2);
  });

  it('keeps a number through a short gap, coasting on, and drops it after a long one', () => {
    const both = (i: number) => [person(0.1 + i * 0.01, 0.2), person(0.7, 0.6)];
    let state = play(Array.from({ length: 10 }, (_, i) => both(i)));
    expect(numbers(state)).toEqual([1, 2]);
    // The first player is hidden for a third of a second, then seen further on.
    state = play(
      Array.from({ length: 5 }, () => [person(0.7, 0.6)]),
      state,
    );
    const hidden = shownTracks(state).find((track) => track.number === 1);
    expect(hidden?.missed).toBeCloseTo(5 * DT);
    expect(hidden?.box.x).toBeGreaterThan(0.19);
    state = play(
      Array.from({ length: 5 }, (_, i) => both(15 + i)),
      state,
    );
    expect(numberAt(state, 0.29, 0.2)).toBe(1);
    expect(shownTracks(state)).toHaveLength(2);
    // Now gone for good: after more than a second the number is free again...
    state = play(
      Array.from({ length: 20 }, () => [person(0.7, 0.6)]),
      state,
    );
    expect(numbers(state)).toEqual([2]);
    // ...and the next player to arrive takes the lowest free one.
    state = play(
      Array.from({ length: 3 }, () => [person(0.7, 0.6), person(0.3, 0.75)]),
      state,
    );
    expect(numberAt(state, 0.3, 0.75)).toBe(1);
    expect(numberAt(state, 0.7, 0.6)).toBe(2);
  });

  it('keeps two players apart when their paths cross', () => {
    const frames = Array.from({ length: 40 }, (_, i) => [
      person(0.2 + i * 0.012, 0.4),
      person(0.68 - i * 0.012, 0.44),
    ]);
    const start = play(frames.slice(0, 5));
    expect(numberAt(start, 0.25, 0.4)).toBe(1);
    expect(numberAt(start, 0.63, 0.44)).toBe(2);
    const end = play(frames);
    expect(numberAt(end, 0.2 + 39 * 0.012, 0.4)).toBe(1);
    expect(numberAt(end, 0.68 - 39 * 0.012, 0.44)).toBe(2);
    expect(end.nextId).toBe(3);
  });

  it('follows a sprint at a low frame rate, where boxes no longer overlap', () => {
    // Four frames a second, a box 0.04 wide moving 0.06 a frame: no overlap at all.
    const frames = Array.from({ length: 8 }, (_, i) => [person(0.1 + i * 0.06, 0.5, 0.04, 0.14)]);
    const end = play(frames, EMPTY_TRACKER, 0.25);
    expect(end.tracks).toHaveLength(1);
    expect(numbers(end)).toEqual([1]);
    // But a box of a very different size, or far away, is somebody else.
    const other = play([[person(0.9, 0.1, 0.04, 0.14)]], end, 0.25);
    expect(other.tracks.map((track) => track.id)).toEqual([1, 2]);
    const giant = play([[person(0.5, 0.3, 0.2, 0.6)]], end, 0.25);
    expect(giant.tracks.map((track) => track.id)).toEqual([1, 2]);
  });

  it('does not fling boxes after a stalled tab, and reads a negative step as none', () => {
    const moving = play(Array.from({ length: 10 }, (_, i) => [person(0.1 + i * 0.02, 0.5)]));
    const [before] = moving.tracks;
    const [after] = stepTracker(moving, [], 30).tracks;
    expect(after?.missed).toBe(0.5);
    expect((after?.box.x ?? 0) - (before?.box.x ?? 0)).toBeCloseTo((before?.vx ?? 0) * 0.5);
    const [same] = stepTracker(moving, [person(0.1 + 9 * 0.02, 0.5)], -1).tracks;
    expect(same?.vx).toBeCloseTo(before?.vx ?? 0);
    expect(same?.missed).toBe(0);
  });

  it('does not depend on the order the detector lists people in', () => {
    const a = person(0.2, 0.3);
    const b = person(0.6, 0.5);
    const c = person(0.4, 0.7);
    const one = play([
      [a, b, c],
      [a, b, c],
      [a, b, c],
      [a, b, c],
    ]);
    const other = play([
      [a, b, c],
      [c, a, b],
      [b, c, a],
      [c, b, a],
    ]);
    expect(other.tracks.map((track) => [track.number, track.box])).toEqual(
      one.tracks.map((track) => [track.number, track.box]),
    );
  });

  it('holds every number for any set of players running in their own lanes', () => {
    const player = fc.record({
      start: fc.double({ min: 0.05, max: 0.85, noNaN: true }),
      speed: fc.double({ min: -0.35, max: 0.35, noNaN: true }),
      jitter: fc.array(fc.double({ min: -0.004, max: 0.004, noNaN: true }), {
        minLength: 40,
        maxLength: 40,
      }),
    });
    fc.assert(
      fc.property(
        fc.array(player, { minLength: 1, maxLength: 8 }),
        fc.boolean(),
        (players, flip) => {
          let state = EMPTY_TRACKER;
          let first: (number | undefined)[] | null = null;
          for (let frame = 0; frame < 40; frame += 1) {
            const seen = players.map((p, lane) =>
              person(
                p.start + p.speed * frame * DT + (p.jitter[frame] ?? 0),
                0.04 + lane * 0.115,
                0.04,
                0.09,
              ),
            );
            // The detector's order is not ours to rely on.
            state = stepTracker(state, flip && frame % 2 === 1 ? [...seen].reverse() : seen, DT);
            if (frame < 2) continue;
            const byLane = players.map((_, lane) =>
              shownTracks(state).find((t) => Math.abs(t.box.y - (0.04 + lane * 0.115)) < 0.02),
            );
            const now = byLane.map((track) => track?.number);
            first ??= now;
            expect(now).toEqual(first);
            expect(new Set(now).size).toBe(players.length);
            expect(Math.max(...now.map((n) => n ?? 0))).toBe(players.length);
            expect(state.tracks).toHaveLength(players.length);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
