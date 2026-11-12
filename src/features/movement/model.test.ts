import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { frameAt, playerPath, teamShape } from '../../engine/tracking';
import type { EvidenceEvent } from '../../engine/types';
import {
  adjacentChance,
  advance,
  chanceStart,
  clampSeconds,
  convexHull,
  cumulativeDistance,
  currentSpeed,
  distanceAt,
  distanceTable,
  matchClock,
  MAX_PLAUSIBLE_SPEED,
  outfield,
  periodDuration,
  readReplay,
  shotMarks,
  spaceLeader,
} from './model';
import { runningTracking, S, shippedTracking, syntheticTracking } from './testTracking';

function polygonArea(points: readonly { x: number; y: number }[]): number {
  const twice = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length] ?? p;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  return twice / 2;
}

describe('time', () => {
  it('clamps any request into the recorded period', () => {
    expect(clampSeconds(-3, 100)).toBe(0);
    expect(clampSeconds(Number.NaN, 100)).toBe(0);
    expect(clampSeconds(42.5, 100)).toBe(42.5);
    expect(clampSeconds(140, 100)).toBe(100);
  });

  it('advances by wall time times speed and stops at the end', () => {
    expect(advance(10, 500, 2, 100)).toEqual({ seconds: 11, ended: false });
    expect(advance(10, -40, 4, 100)).toEqual({ seconds: 10, ended: false });
    expect(advance(99.5, 1000, 1, 100)).toEqual({ seconds: 100, ended: true });
  });

  it('formats the clock like a scoreboard, the second half from 45:00', () => {
    expect(matchClock(1, 0)).toBe('00:00');
    expect(matchClock(1, 65.9)).toBe('01:05');
    expect(matchClock(1, 2769)).toBe('46:09');
    expect(matchClock(2, 0)).toBe('45:00');
    expect(matchClock(2, 125)).toBe('47:05');
    expect(matchClock(1, -4)).toBe('00:00');
  });

  it('knows how long each recorded period is', () => {
    const real = shippedTracking();
    expect(periodDuration(real, 1)).toBe(2769);
    expect(periodDuration(real, 2)).toBe(2888.75);
    expect(periodDuration(real, 3)).toBe(0);
  });
});

describe('chances', () => {
  const event = (id: string, period: number, t: number, weight = 1234): EvidenceEvent => ({
    id,
    period,
    t,
    side: id.startsWith('h') ? 'home' : 'away',
    weight,
  });
  const events = [
    event('a1', 1, 300),
    event('h1', 1, 52.4, 354),
    event('h2', 2, 10),
    event('a2', 1, 4),
    event('h3', 1, 1200),
  ];

  it('keeps the period, sorts by time, converts xG and places each mark', () => {
    const marks = shotMarks(events, 1, 600);
    expect(marks.map((m) => m.id)).toEqual(['a2', 'h1', 'a1']);
    expect(marks[1]).toMatchObject({ side: 'home', xg: 0.0354, seconds: 52.4 });
    expect(marks[2]?.position).toBeCloseTo(0.5);
    expect(shotMarks(events, 1, 0)).toEqual([]);
  });

  it('jumps to the build-up of the next and previous chance', () => {
    const marks = shotMarks(events, 1, 2000);
    expect(marks.map(chanceStart)).toEqual([0, 46.4, 294, 1194]);
    expect(adjacentChance(marks, 0, 1)?.id).toBe('h1');
    expect(adjacentChance(marks, 46.4, 1)?.id).toBe('a1');
    expect(adjacentChance(marks, 1194, 1)).toBeNull();
    expect(adjacentChance(marks, 1194, -1)?.id).toBe('a1');
    expect(adjacentChance(marks, 0, -1)).toBeNull();
  });

  it('places the real shots of this match inside the recorded halves', async () => {
    const { demoMatches } = await import('../../data/dfl');
    const match = demoMatches.find((m) => m.id === 'DFL-MAT-J03WN1');
    const real = shippedTracking();
    const both = [1, 2].flatMap((p) => shotMarks(match?.events ?? [], p, periodDuration(real, p)));
    expect(both).toHaveLength(match?.events.length ?? -1);
    expect(both.length).toBeGreaterThan(10);
  });
});

describe('space leader', () => {
  it('names a side only beyond the margin', () => {
    expect(spaceLeader(0.56)).toBe('home');
    expect(spaceLeader(0.44)).toBe('away');
    expect(spaceLeader(0.505)).toBe('level');
    expect(spaceLeader(0.495)).toBe('level');
  });
});

describe('convex hull', () => {
  it('drops inner and collinear points and runs counter-clockwise', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 2 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
    ];
    const hull = convexHull(square);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBe(4);
    expect(convexHull(square.slice(0, 2))).toHaveLength(2);
  });

  it('matches the engine hull area on every real frame tried', () => {
    const real = shippedTracking();
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 }),
        fc.double({ min: 0, max: 2768, noNaN: true }),
        (period, seconds) => {
          const frame = frameAt(real, period, seconds);
          for (const side of ['home', 'away'] as const) {
            const area = polygonArea(convexHull(outfield(frame, side)));
            expect(area).toBeCloseTo(teamShape(frame, side)?.area ?? 0, 6);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('distance and speed', () => {
  it('sums connected steps and leaves out gaps and glitches', () => {
    const path = [
      { seconds: 0, x: 0, y: 0, connected: false },
      { seconds: 0.25, x: 1, y: 0, connected: true },
      { seconds: 0.5, x: 1, y: 2, connected: true },
      { seconds: 0.75, x: 30, y: 2, connected: true },
      { seconds: 1.5, x: 0, y: 0, connected: false },
      { seconds: 1.75, x: 0, y: 1, connected: true },
    ];
    const table = cumulativeDistance(path);
    expect([...table.metres]).toEqual([0, 1, 3, 3, 3, 4]);
    expect(distanceAt(table, -1)).toBe(0);
    expect(distanceAt(table, 0.375)).toBeCloseTo(2);
    expect(distanceAt(table, 9)).toBe(4);
    expect(distanceAt(cumulativeDistance([]), 5)).toBe(0);
  });

  it('reads a steady run exactly', () => {
    const run = runningTracking(41, 6);
    expect(currentSpeed(run, 1, 1, 5)).toBeCloseTo(6, 6);
    expect(currentSpeed(run, 1, 1, 0.5)).toBeCloseTo(6, 6);
    expect(currentSpeed(run, 1, 1, 0.1)).toBeNull();
    expect(currentSpeed(run, 0, 1, 5)).toBe(0);
    expect(distanceAt(distanceTable(run, 1, 1), 10)).toBeCloseTo(60, 6);
    expect(distanceAt(distanceTable(run, 1, 1), 2.5)).toBeCloseTo(15, 6);
  });

  it('says nothing about speed across an absence or a glitch', () => {
    const gap = syntheticTracking(12, (f, c) =>
      c === 1 && f === 6 ? null : [c === 1 ? 100 * f : 1000 * (c - 2), 100 * c],
    );
    expect(currentSpeed(gap, 1, 1, 1.25)).toBeCloseTo(4, 6);
    expect(currentSpeed(gap, 1, 1, 2)).toBeNull();
    const fast = runningTracking(20, MAX_PLAUSIBLE_SPEED + 1);
    expect(currentSpeed(fast, 1, 1, 3)).toBeNull();
    expect(distanceAt(distanceTable(fast, 1, 1), 4)).toBe(0);
  });

  it('agrees with the engine path on the real match', () => {
    const real = shippedTracking();
    const path = playerPath(real, 5, 1, 600, 900);
    const table = cumulativeDistance(path);
    const metres = (table.metres[table.metres.length - 1] ?? 0) - (table.metres[0] ?? 0);
    // Five minutes of a professional outfield player: a few hundred metres, never kilometres.
    expect(metres).toBeGreaterThan(200);
    expect(metres).toBeLessThan(1000);
  });
});

describe('readReplay', () => {
  it('gathers the clock, both shapes, the share of space and the chosen player', () => {
    const run = runningTracking(41, 6);
    const table = distanceTable(run, 1, 1);
    const read = readReplay(run, 1, 5, 1, table);
    expect(read.clock).toBe('00:05');
    expect(read.home?.count).toBe(1);
    expect(read.away?.count).toBe(1);
    expect(read.homeShare).toBeGreaterThan(0);
    expect(read.owners).toHaveLength(32 * 21);
    expect(read.leader).not.toBeNull();
    expect(read.player).toMatchObject({ side: 'home', shirt: 9, onPitch: true });
    expect(read.player?.speed).toBeCloseTo(6, 6);
    expect(read.player?.metres).toBeCloseTo(30, 6);
  });

  it('clamps the time, and copes with nobody chosen, an unknown slot and an empty pitch', () => {
    const run = runningTracking(9, 2);
    expect(readReplay(run, 1, 99, null, null).clock).toBe('00:02');
    expect(readReplay(run, 1, 1, 17, null).player).toBeNull();
    expect(readReplay(run, 1, 1, 3, null).player?.metres).toBe(0);
    const empty = syntheticTracking(9, (f) => (f === 0 ? [f, 0] : null));
    const read = readReplay(empty, 1, 1, 0, null);
    expect([read.homeShare, read.leader, read.home]).toEqual([null, null, null]);
    expect(read.player?.onPitch).toBe(false);
    expect(S).toBe(-32768);
  });
});
