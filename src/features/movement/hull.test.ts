import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createHullScratch, hullInto } from './hull';
import { convexHull } from './model';

function run(points: readonly { x: number; y: number }[], capacity = 16) {
  const xy = new Float32Array(points.flatMap((p) => [p.x, p.y]));
  const out = new Float32Array(capacity * 2);
  const count = hullInto(xy, points.length, createHullScratch(capacity), out);
  return Array.from({ length: count }, (_, i) => ({ x: out[i * 2], y: out[i * 2 + 1] }));
}

describe('hullInto', () => {
  it('walks a square counter-clockwise and leaves out what is inside or on an edge', () => {
    const hull = run([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 },
      { x: 2, y: 0 },
    ]);
    expect(hull).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]);
  });

  it('returns one or two points as they are, and the ends of a straight line', () => {
    expect(run([])).toEqual([]);
    expect(run([{ x: 3, y: 1 }])).toEqual([{ x: 3, y: 1 }]);
    expect(
      run([
        { x: 5, y: 5 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 5, y: 5 },
    ]);
    expect(
      run([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 3 },
    ]);
  });

  it('reads no more points than the scratch space holds and writes no more than fit', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({
      x: Math.cos(i),
      y: Math.sin(i),
    }));
    expect(run(points, 4).length).toBeLessThanOrEqual(4);
    const xy = new Float32Array(points.flatMap((p) => [p.x, p.y]));
    const small = new Float32Array(4);
    expect(hullInto(xy, 12, createHullScratch(16), small)).toBe(2);
  });

  it('agrees with the allocating hull on any set of players', () => {
    // Quarter-metre steps, as exact in Float32 as in the doubles the other hull reads.
    const point = fc.record({
      x: fc.integer({ min: -210, max: 210 }).map((v) => v / 4),
      y: fc.integer({ min: -136, max: 136 }).map((v) => v / 4),
    });
    fc.assert(
      fc.property(fc.array(point, { maxLength: 16 }), (points) => {
        expect(run(points)).toEqual(convexHull(points));
      }),
    );
  });
});
