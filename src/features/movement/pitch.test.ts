import { describe, expect, it } from 'vitest';
import { formatMegabytes, formatNumber, formatPercent } from './format';
import {
  CAMERA_PRESETS,
  clampOrbit,
  followAimX,
  followAimZ,
  glideOrbit,
  FOV_DEGREES,
  LAW,
  MAX_ELEVATION,
  orbitBy,
  orbitPosition,
  pitchMarkings,
  presetOrbit,
  type Point,
} from './pitch';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('pitch markings', () => {
  const { lines, spots } = pitchMarkings(105, 68);
  const all = lines.flat();

  it('draws the outline, halfway line, centre circle and both ends to scale', () => {
    // outline + halfway + circle, then per end: two boxes, the arc, two corner arcs.
    expect(lines).toHaveLength(3 + 2 * 5);
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([
      -52.5, 52.5, -34, 34,
    ]);
    const circle = lines[2] ?? [];
    expect(circle.every((p) => near(Math.hypot(p.x, p.y), LAW.centreCircle))).toBe(true);
    expect(spots).toEqual([
      { x: 0, y: 0 },
      { x: -41.5, y: 0 },
      { x: 41.5, y: 0 },
    ]);
  });

  it('sizes the penalty and goal areas by the Laws of the Game', () => {
    const box = (line: readonly Point[]) => {
      const xs = line.map((p) => p.x);
      const ys = line.map((p) => p.y);
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    };
    expect(box(lines[3] ?? [])).toEqual([16.5, 40.32]);
    expect(box(lines[4] ?? [])).toEqual([5.5, 18.32]);
  });

  it('ends each penalty arc on the edge of its area, outside it', () => {
    for (const index of [5, 10]) {
      const arc = lines[index] ?? [];
      const first = arc[0];
      const last = arc[arc.length - 1];
      expect(near(Math.abs(first?.x ?? 0), 52.5 - 16.5)).toBe(true);
      expect(near(Math.abs(last?.x ?? 0), 52.5 - 16.5)).toBe(true);
      expect(arc.every((p) => Math.abs(p.x) <= 36 + 1e-9)).toBe(true);
    }
  });

  it('keeps every corner arc inside the pitch', () => {
    for (const index of [6, 7, 11, 12]) {
      const arc = lines[index] ?? [];
      expect(arc).toHaveLength(9);
      expect(arc.every((p) => Math.abs(p.x) <= 52.5 + 1e-9 && Math.abs(p.y) <= 34 + 1e-9)).toBe(
        true,
      );
    }
  });
});

describe('camera', () => {
  it('fits the whole pitch for every aspect in the top-down view', () => {
    for (const aspect of [0.6, 1, 16 / 9]) {
      const orbit = presetOrbit('tactical', aspect);
      const vHalf = (FOV_DEGREES * Math.PI) / 360;
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      // Portrait canvases turn the pitch so its length runs up the screen.
      const [across, along] = aspect < 1 ? [34, 52.5] : [52.5, 34];
      expect(orbit.elevation).toBe(MAX_ELEVATION);
      expect(orbit.azimuth).toBe(aspect < 1 ? Math.PI / 2 : 0);
      expect(orbit.distance * Math.tan(hHalf)).toBeGreaterThanOrEqual(across);
      expect(orbit.distance * Math.tan(vHalf)).toBeGreaterThanOrEqual(along);
    }
  });

  it('puts the side-on camera over the near touchline and the goal camera behind a goal', () => {
    const [x, y, z] = orbitPosition(presetOrbit('broadcast', 16 / 9));
    expect(Math.abs(x)).toBeLessThan(1e-9);
    expect(y).toBeGreaterThan(20);
    expect(z).toBeGreaterThan(34);
    const [gx] = orbitPosition(presetOrbit('goal', 1, 1));
    const [lx] = orbitPosition(presetOrbit('goal', 1));
    expect(gx).toBeGreaterThan(52.5);
    expect(lx).toBeLessThan(-52.5);
    expect(CAMERA_PRESETS).toEqual(['broadcast', 'tactical', 'goal', 'follow']);
  });

  it('turns, tilts and zooms within limits', () => {
    const start = presetOrbit('broadcast', 1);
    const turned = orbitBy(start, 100, 0);
    expect(turned.azimuth).toBeCloseTo(start.azimuth - 0.6);
    expect(orbitBy(start, 0, 10_000).elevation).toBe(MAX_ELEVATION);
    expect(orbitBy(start, 0, -10_000).elevation).toBeCloseTo(0.08);
    expect(orbitBy(start, 0, 0, 100).distance).toBe(320);
    expect(clampOrbit({ ...start, distance: 1 }).distance).toBe(12);
  });

  it('glides the short way round, in place, and says when it has arrived', () => {
    const start = { ...presetOrbit('broadcast', 1), azimuth: 3 };
    const to = { ...start, azimuth: -3, distance: start.distance + 10 };
    const moving = { ...start };
    expect(glideOrbit(moving, to, 0.5)).toBe(false);
    expect(moving.azimuth).toBeGreaterThan(3);
    expect(moving.distance).toBeCloseTo(start.distance + 5);
    expect(glideOrbit(moving, to, 1)).toBe(true);
    expect(Math.sin(moving.azimuth - to.azimuth)).toBeCloseTo(0);
    expect(moving.distance).toBeCloseTo(to.distance);
  });

  it('moves its aim apart from the rest, so a followed ball is caught up with slowly', () => {
    const goal = presetOrbit('follow', 16 / 9);
    const moving = { ...goal };
    expect(glideOrbit(moving, goal, 1, 30, -10, 0.25)).toBe(false);
    expect(moving.targetX).toBeCloseTo(7.5);
    expect(moving.targetZ).toBeCloseTo(-2.5);
    expect(moving.distance).toBe(goal.distance);
    expect(glideOrbit(moving, goal, 1, 30, -10, 1)).toBe(true);
    expect([moving.targetX, moving.targetZ]).toEqual([30, -10]);
  });

  it('stands the follow camera close and side-on, and keeps its aim inside the pitch', () => {
    const follow = presetOrbit('follow', 16 / 9);
    const whole = presetOrbit('broadcast', 16 / 9);
    expect(follow.azimuth).toBe(0);
    expect(follow.distance).toBeLessThan(whole.distance * 0.6);
    expect(followAimX(10)).toBe(10);
    expect(followAimX(52)).toBe(34);
    expect(followAimX(-52)).toBe(-34);
    expect(followAimZ(-3)).toBe(-3);
    expect(followAimZ(33)).toBe(12);
    expect(followAimZ(-33)).toBe(-12);
  });
});

describe('format', () => {
  it('uses each language’s separators and a real minus', () => {
    expect(formatNumber(1234.56, 1, 'en')).toBe('1,234.6');
    expect(formatNumber(1234.56, 1, 'bs')).toBe('1.234,6');
    expect(formatNumber(-0.04, 1, 'en')).toBe('0.0');
    expect(formatNumber(-2.5, 1, 'bs')).toBe('−2,5');
    expect(formatNumber(12, 0, 'xx')).toBe('12');
    expect(formatPercent(0.537, 'en')).toBe('54');
    expect(formatMegabytes(2_715_960, 'bs')).toBe('2,7');
  });
});
