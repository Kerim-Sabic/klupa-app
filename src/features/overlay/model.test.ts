import { describe, expect, it } from 'vitest';
import {
  EMPTY_FRAME,
  EMPTY_OVERLAY,
  MIN_REST_MS,
  nextAnalysisAt,
  recentFrames,
  stepOverlay,
  type OverlayState,
} from './model';
import type { Pixels, Rgb } from './teams';
import type { Detection } from './track';

const RED: Rgb = [205, 35, 45];
const BLUE: Rgb = [35, 65, 185];
const YELLOW: Rgb = [240, 225, 40];
const WIDTH = 200;
const HEIGHT = 100;

interface Player {
  readonly x: number;
  readonly y: number;
  readonly kit: Rgb;
}

const boxOf = (p: Player): Detection => ({ x: p.x, y: p.y, w: 0.06, h: 0.3, score: 0.9 });

/** Grass with each player painted as a block of their kit colour where their box is. */
function picture(players: readonly Player[]): Pixels {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) data.set([45, 135, 65, 255], i * 4);
  for (const p of players) {
    for (let y = Math.round(p.y * HEIGHT); y < Math.round((p.y + 0.3) * HEIGHT); y += 1) {
      for (let x = Math.round(p.x * WIDTH); x < Math.round((p.x + 0.06) * WIDTH); x += 1) {
        data.set([...p.kit, 255], (y * WIDTH + x) * 4);
      }
    }
  }
  return { data, width: WIDTH, height: HEIGHT };
}

const SQUAD: Player[] = [
  { x: 0.1, y: 0.1, kit: RED },
  { x: 0.3, y: 0.5, kit: BLUE },
  { x: 0.5, y: 0.2, kit: RED },
  { x: 0.7, y: 0.6, kit: BLUE },
  { x: 0.85, y: 0.3, kit: YELLOW },
];

function play(frames: number, players = SQUAD, withPixels = true) {
  let state: OverlayState = EMPTY_OVERLAY;
  let frame = EMPTY_FRAME;
  for (let i = 0; i < frames; i += 1) {
    ({ state, frame } = stepOverlay(
      state,
      players.map(boxOf),
      withPixels ? picture(players) : null,
      1 / 15,
    ));
  }
  return { state, frame };
}

describe('stepOverlay', () => {
  it('shows nobody until players have been seen three times', () => {
    expect(play(2).frame).toEqual(EMPTY_FRAME);
  });

  it('numbers every player, splits the two kits and leaves the referee neutral', () => {
    const { frame } = play(4);
    expect(frame.players.map((p) => p.number)).toEqual([1, 2, 3, 4, 5]);
    const [red1, blue1, red2, blue2, referee] = frame.players.map((p) => p.team);
    expect(red1).not.toBe('none');
    expect(red2).toBe(red1);
    expect(blue2).toBe(blue1);
    expect(blue1).not.toBe(red1);
    expect(referee).toBe('none');
    expect(frame.counts).toEqual({ a: 2, b: 2, none: 1 });
    // Each team's ring is drawn in its own shirt colour: red is red, blue is blue.
    const redRing = frame.colours[red1 === 'a' ? 'a' : 'b'];
    const blueRing = frame.colours[blue1 === 'a' ? 'a' : 'b'];
    expect(redRing?.[0]).toBeGreaterThan((redRing?.[2] ?? 0) + 80);
    expect(blueRing?.[2]).toBeGreaterThan((blueRing?.[0] ?? 0) + 80);
    const first = frame.players[0];
    expect(first?.feet.x).toBeCloseTo(0.13);
    expect(first?.feet.y).toBeCloseTo(0.4);
  });

  it('draws everyone neutral when the picture cannot be read, and when the kits match', () => {
    const blind = play(4, SQUAD, false).frame;
    expect(blind.counts).toEqual({ a: 0, b: 0, none: 5 });
    expect(blind.colours).toEqual({ a: null, b: null });
    const sameKit = play(
      4,
      SQUAD.slice(0, 4).map((p) => ({ ...p, kit: RED })),
    ).frame;
    expect(sameKit.counts).toEqual({ a: 0, b: 0, none: 4 });
    expect(sameKit.colours).toEqual({ a: null, b: null });
  });

  it('keeps a hidden player their team, and forgets the colour of one who left', () => {
    const { state } = play(5);
    const team = (s: OverlayState, players: readonly Player[]) =>
      stepOverlay(s, players.map(boxOf), picture(players), 1 / 15);
    // The first red player is hidden behind someone: no detection, and blue painted there.
    const without = SQUAD.slice(1);
    const hidden = team(state, [...without, { x: 0.1, y: 0.1, kit: BLUE }].slice(0, 4));
    const first = hidden.frame.players.find((p) => p.number === 1);
    const other = hidden.frame.players.find((p) => p.number === 3);
    expect(first?.team).toBe(other?.team);
    expect(hidden.state.colours.size).toBe(5);
    // Gone for well over a second: dropped, and nothing about them is kept.
    let later = hidden.state;
    for (let i = 0; i < 20; i += 1) later = team(later, without).state;
    expect(later.tracker.tracks).toHaveLength(4);
    expect(later.colours.size).toBe(4);
    expect([...later.colours.keys()]).not.toContain(1);
  });

  it('keeps team a as team a while everyone moves', () => {
    let { state, frame } = play(4);
    const before = frame.players.map((p) => p.team);
    for (let i = 1; i <= 20; i += 1) {
      const moved = SQUAD.map((p) => ({ ...p, x: p.x + i * 0.004 }));
      ({ state, frame } = stepOverlay(state, moved.map(boxOf), picture(moved), 1 / 15));
    }
    expect(frame.players.map((p) => p.team)).toEqual(before);
    expect(frame.players.map((p) => p.number)).toEqual([1, 2, 3, 4, 5]);
    expect(frame.players[0]?.trail.length).toBeGreaterThan(10);
  });
});

describe('nextAnalysisAt', () => {
  it('rests as long as the analysis took, and never less than the shortest rest', () => {
    // A slow phone: 300 ms of work, then 300 ms in which taps are answered.
    expect(nextAnalysisAt(1300, 300)).toBe(1600);
    // A fast one: 8 ms of work still leaves the shortest rest.
    expect(nextAnalysisAt(1008, 8)).toBe(1008 + MIN_REST_MS);
    expect(nextAnalysisAt(500, 0)).toBe(500 + MIN_REST_MS);
    expect(nextAnalysisAt(500, -5)).toBe(500 + MIN_REST_MS);
    // Ten milliseconds of work and ten of rest are over well before a 30-a-second camera's
    // next picture, 33 ms after the last: a fast device loses no frame to the rest.
    expect(nextAnalysisAt(10, 10)).toBeLessThan(1000 / 30);
  });
});

describe('recentFrames', () => {
  it('keeps the last second and adds now, so its length is the frames a second', () => {
    expect(recentFrames([], 5000)).toEqual([5000]);
    expect(recentFrames([3900, 4000, 4001, 4500, 4990], 5000)).toEqual([4001, 4500, 4990, 5000]);
    expect(recentFrames([100, 200, 300], 350, 100)).toEqual([300, 350]);
    // A clock that jumped back does not leave moments from the future behind.
    expect(recentFrames([9000], 5000)).toEqual([5000]);
  });
});
