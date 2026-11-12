import { describe, expect, it } from 'vitest';
import { fanInto, ribbonFloats, ribbonInto } from './ribbon';
import { hexToRgb, paintSpace, SPACE_CELL_PX } from './spaceTexture';
import { SPACE_COLS, SPACE_ROWS } from './model';

/** Every vertex of the written triangles as [x, height, z]. */
function vertices(out: Float32Array, floats: number): number[][] {
  const list: number[][] = [];
  for (let i = 0; i < floats; i += 3) list.push([out[i] ?? 0, out[i + 1] ?? 0, out[i + 2] ?? 0]);
  return list;
}

describe('ribbonInto', () => {
  it('builds a strip of the given width along a line, flipping pitch y into three.js z', () => {
    const out = new Float32Array(ribbonFloats(1));
    const floats = ribbonInto([0, 0, 10, 0], 2, { width: 2, height: 0.5 }, out);
    expect(floats).toBe(18);
    const points = vertices(out, floats);
    expect(points.every((p) => p[1] === 0.5)).toBe(true);
    expect(Math.min(...points.map((p) => p[2] ?? 0))).toBe(-1);
    expect(Math.max(...points.map((p) => p[2] ?? 0))).toBe(1);
    expect(Math.max(...points.map((p) => p[0] ?? 0))).toBe(10);
  });

  it('closes a loop, skips zero-length steps and appends after a start offset', () => {
    const square = [0, 0, 4, 0, 4, 4, 0, 4];
    const out = new Float32Array(ribbonFloats(4) * 2);
    expect(ribbonInto(square, 4, { width: 0.2, height: 0, closed: true }, out)).toBe(4 * 18);
    expect(ribbonInto(square, 4, { width: 0.2, height: 0 }, out, 72)).toBe(3 * 18);
    expect(ribbonInto([1, 1, 1, 1], 2, { width: 1, height: 0 }, out)).toBe(0);
    expect(ribbonInto([0, 0, 1, 0, 2, 0], 3, { width: 1, height: 0 }, new Float32Array(20))).toBe(
      18,
    );
  });

  it('breaks into dashes measured along the whole outline', () => {
    const line = [0, 0, 10, 0];
    const dash = { on: 2, off: 1 };
    const out = new Float32Array(ribbonFloats(1, dash, 10));
    // 0-2, 3-5, 6-8, 9-10: four dashes.
    const floats = ribbonInto(line, 2, { width: 0.2, height: 0, dash }, out);
    expect(floats).toBe(4 * 18);
    const xs = vertices(out, floats).map((p) => p[0] ?? 0);
    expect(Math.max(...xs)).toBe(10);
    expect(xs.some((x) => x > 2 && x < 3)).toBe(false);
    // The pattern carries on round a corner instead of restarting.
    const corner = new Float32Array(ribbonFloats(2, dash, 4));
    const bent = ribbonInto([0, 0, 2.5, 0, 2.5, 2], 3, { width: 0.2, height: 0, dash }, corner);
    const ys = vertices(corner, bent)
      .filter((p) => (p[0] ?? 0) > 2.35)
      .map((p) => -(p[2] ?? 0));
    // 2.5 m along, the gap (2 to 3) still has 0.5 m to run up the second side.
    expect(ys.some((y) => y > 0.05 && y < 0.45)).toBe(false);
    expect(ys.some((y) => y === 0.5)).toBe(true);
  });
});

describe('fanInto', () => {
  it('fills a convex polygon with count - 2 triangles', () => {
    const out = new Float32Array(64);
    expect(fanInto([0, 0, 4, 0, 4, 4, 0, 4], 4, 0.1, out)).toBe(2 * 9);
    expect(fanInto([0, 0, 4, 0], 2, 0.1, out)).toBe(0);
    expect(fanInto([0, 0, 4, 0, 4, 4, 0, 4], 4, 0.1, new Float32Array(9))).toBe(9);
  });
});

describe('space texture', () => {
  it('reads hex colours and falls back to grey', () => {
    expect(hexToRgb('#1d4ed8')).toEqual([29, 78, 216]);
    expect(hexToRgb(' #fff ')).toEqual([255, 255, 255]);
    expect(hexToRgb('oklch(0.5 0.1 200)')).toEqual([128, 128, 128]);
  });

  it('paints home cells solid and away cells striped, row 0 at the bottom', () => {
    const owners = new Uint8Array(SPACE_COLS * SPACE_ROWS);
    owners[0] = 1;
    const width = SPACE_COLS * SPACE_CELL_PX;
    const pixels = new Uint8Array(width * SPACE_ROWS * SPACE_CELL_PX * 4);
    paintSpace(owners, pixels, { home: '#0000ff', away: '#ff0000' });
    const pixel = (x: number, y: number) => [
      ...pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4),
    ];
    expect(pixel(0, 0)).toEqual([0, 0, 255, 92]);
    expect(pixel(3, 2)).toEqual([0, 0, 255, 92]);
    const away = Array.from({ length: SPACE_CELL_PX }, (_, x) => pixel(SPACE_CELL_PX + x, 0)[3]);
    expect(new Set(away)).toEqual(new Set([118, 34]));
    expect(pixel(SPACE_CELL_PX, 0).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it('paints a finer grid when one is given, with stripes of the same width', () => {
    // Two cells by one, four pixels each: home on the left, away on the right.
    const pixels = new Uint8Array(8 * 4 * 4);
    paintSpace(Uint8Array.of(1, 0), pixels, { home: '#0000ff', away: '#ff0000' }, 2, 1, 4);
    const alpha = (x: number, y: number) => pixels[(y * 8 + x) * 4 + 3];
    expect([alpha(0, 0), alpha(3, 3)]).toEqual([92, 92]);
    expect([alpha(4, 0), alpha(7, 0), alpha(4, 3), alpha(7, 3)]).toEqual([34, 34, 34, 118]);
    expect(Array.from(pixels.slice(4 * 4, 4 * 4 + 3))).toEqual([255, 0, 0]);
  });
});
