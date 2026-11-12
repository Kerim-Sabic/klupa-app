import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { frameAt, playerPath } from '../../engine/tracking';
import {
  catmullRom,
  createHeadings,
  createPositions,
  headingsInto,
  samplePositions,
  trailCapacity,
  trailInto,
} from './motion';
import { shippedTracking, syntheticTracking } from './testTracking';

const real = shippedTracking();

describe('samplePositions', () => {
  it('equals the engine exactly at every sample time', () => {
    const out = createPositions(real);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 }), fc.integer({ min: 0, max: 11_076 }), (p, f) => {
        const seconds = f / 4;
        samplePositions(real, p, seconds, out);
        const frame = frameAt(real, p, seconds);
        const on = frame.players.map((pl) => pl.slot);
        for (const player of frame.players) {
          expect(out.xy[player.slot * 2]).toBeCloseTo(player.x, 4);
          expect(out.xy[player.slot * 2 + 1]).toBeCloseTo(player.y, 4);
        }
        const present = [...out.present.slice(0, -1)].flatMap((v, slot) => (v === 1 ? [slot] : []));
        expect(present).toEqual(on);
        expect(out.present[29] === 1).toBe(frame.ball !== null);
      }),
      { numRuns: 60 },
    );
  });

  it('stays close to the straight line between samples and shows the same players', () => {
    const out = createPositions(real);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 2768, noNaN: true }), (seconds) => {
        samplePositions(real, 1, seconds, out);
        const frame = frameAt(real, 1, seconds);
        for (const player of frame.players) {
          const dx = (out.xy[player.slot * 2] ?? 0) - player.x;
          const dy = (out.xy[player.slot * 2 + 1] ?? 0) - player.y;
          expect(Math.hypot(dx, dy)).toBeLessThan(1);
        }
        if (frame.ball !== null) expect(out.xy[58]).toBeCloseTo(frame.ball.x, 4);
      }),
      { numRuns: 80 },
    );
  });

  it('clamps beyond the end, and draws nothing for an unknown period', () => {
    const out = createPositions(real);
    samplePositions(real, 1, 99_999, out);
    expect(out.present.some((v) => v === 1)).toBe(true);
    samplePositions(real, 5, 10, out);
    expect(out.present.every((v) => v === 0)).toBe(true);
  });

  it('eases in where an outer neighbour is missing, and never bridges an absence', () => {
    const track = syntheticTracking(6, (f, c) => {
      if (c === 1 && f === 0) return null;
      if (c === 1 && f === 4) return null;
      return [c === 1 ? 400 * f : 1000 * (c - 2), 0];
    });
    const out = createPositions(track);
    samplePositions(track, 1, 0.375, out);
    expect(out.present[1]).toBe(1);
    expect(out.xy[2]).toBeGreaterThan(4);
    expect(out.xy[2]).toBeLessThan(8);
    samplePositions(track, 1, 0.875, out);
    expect(out.present[1]).toBe(0);
  });

  it('interpolates a Catmull-Rom curve through its middle points', () => {
    expect(catmullRom(0, 1, 2, 3, 0)).toBe(1);
    expect(catmullRom(0, 1, 2, 3, 1)).toBe(2);
    expect(catmullRom(0, 1, 2, 3, 0.5)).toBe(1.5);
  });
});

describe('trailInto', () => {
  it('follows the engine path over the last ten seconds and ends at the marker', () => {
    const positions = createPositions(real);
    const out = new Float32Array(trailCapacity(real, 10) * 2);
    samplePositions(real, 1, 600.6, positions);
    const count = trailInto(real, 5, 1, 600.6, 10, positions, out);
    const samples = playerPath(real, 5, 1, 590.6, 600.6).filter((p) => p.seconds % 0.25 === 0);
    expect(count).toBe(samples.length + 1);
    expect(out[0]).toBeCloseTo(samples[0]?.x ?? 0, 4);
    expect(out[(count - 1) * 2]).toBe(positions.xy[10]);
  });

  it('keeps only the latest unbroken run, and nothing for a player off the pitch', () => {
    const track = syntheticTracking(30, (f, c) => (c === 1 && f === 10 ? null : [100 * f, 0]));
    const positions = createPositions(track);
    const out = new Float32Array(trailCapacity(track, 10) * 2);
    samplePositions(track, 1, 5, positions);
    expect(trailInto(track, 1, 1, 5, 10, positions, out)).toBe(10 + 1);
    samplePositions(track, 1, 2.5, positions);
    expect(trailInto(track, 1, 1, 2.5, 10, positions, out)).toBe(0);
    expect(trailInto(track, 1, 4, 2.5, 10, positions, out)).toBe(0);
    const tiny = new Float32Array(6);
    samplePositions(track, 1, 5, positions);
    expect(trailInto(track, 1, 1, 5, 10, positions, tiny)).toBe(3);
  });
});

describe('headingsInto', () => {
  const pair = (now: number[], before: number[], present: [number[], number[]] = [[], []]) => {
    const count = now.length / 2;
    const make = (xy: number[], off: number[]) => {
      const out = { xy: new Float32Array(xy), present: new Uint8Array(count).fill(1) };
      for (const slot of off) out.present[slot] = 0;
      return out;
    };
    return [make(now, present[0]), make(before, present[1])] as const;
  };
  const headings = (count: number) => ({
    angle: new Float32Array(count),
    speed: new Float32Array(count),
  });

  it('faces a player the way they are moving and reads their speed', () => {
    // Slot 0 runs up the pitch (+x), slot 1 across it (+y), slot 2 back down (-x).
    const [now, before] = pair([1, 0, 0, 2, -3, 0], [0, 0, 0, 0, 0, 0]);
    const out = headings(3);
    headingsInto(now, before, 0.5, 1, out);
    expect(out.angle[0]).toBeCloseTo(0);
    expect(out.angle[1]).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(out.angle[2] ?? 0)).toBeCloseTo(Math.PI);
    expect(Array.from(out.speed)).toEqual([2, 4, 6]);
  });

  it('keeps the old facing for someone standing, off the pitch, or moved by a glitch', () => {
    const [now, before] = pair([0.1, 0, 5, 5, 5, 5, 50, 0], [0, 0, 4, 4, 4, 4, 0, 0], [[1], [2]]);
    const out = headings(4);
    out.angle.fill(1.25);
    headingsInto(now, before, 0.5, 1, out);
    expect(Array.from(out.angle)).toEqual([1.25, 1.25, 1.25, 1.25]);
    // Standing still is a speed; the other three are not known and read as nought.
    expect(out.speed[0]).toBeCloseTo(0.2);
    expect(Array.from(out.speed).slice(1)).toEqual([0, 0, 0]);
    headingsInto(now, before, 0, 1, out);
    expect(Array.from(out.speed)).toEqual([0, 0, 0, 0]);
  });

  it('turns part of the way, the short way round', () => {
    const [now, before] = pair([-1, -0.1], [0, 0]);
    const out = headings(1);
    out.angle[0] = 3;
    headingsInto(now, before, 0.25, 0.5, out);
    // From 3 rad towards about -3.04 rad: on through pi, not back through nought.
    expect(out.angle[0]).toBeGreaterThan(3);
    expect(out.angle[0]).toBeLessThan(3.2);
  });

  it('has room for every roster slot of a real match', () => {
    const out = createHeadings(real);
    expect(out.angle).toHaveLength(real.meta.roster.length);
    const now = createPositions(real);
    const before = createPositions(real);
    samplePositions(real, 1, 600, now);
    samplePositions(real, 1, 599.7, before);
    headingsInto(now, before, 0.3, 1, out);
    expect(Math.max(...out.speed)).toBeGreaterThan(0.5);
    expect(Math.max(...out.speed)).toBeLessThanOrEqual(12);
  });
});
