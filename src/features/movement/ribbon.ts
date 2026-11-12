/**
 * Flat ribbons on the grass for the 3D view: pitch lines, team outlines and the player trail.
 * WebGL draws lines one pixel wide whatever the distance, so lines that should look painted
 * are built as thin strips of triangles instead. Output is three.js positions (x, height,
 * -pitch y) written into a buffer allocated once; no three.js import here.
 */

export interface Dash {
  readonly on: number;
  readonly off: number;
}

/** Floats needed for a ribbon over `segments` segments (two triangles of three vertices each). */
export function ribbonFloats(segments: number, dash: Dash | null = null, perimeter = 0): number {
  const pieces = dash === null ? segments : segments + Math.ceil(perimeter / (dash.on + dash.off));
  return pieces * 18;
}

function put(out: Float32Array, at: number, x: number, y: number, height: number): void {
  out[at] = x;
  out[at + 1] = height;
  out[at + 2] = -y;
}

function quad(
  out: Float32Array,
  at: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  half: number,
  height: number,
): number {
  const length = Math.hypot(bx - ax, by - ay);
  if (length === 0 || at + 18 > out.length) return at;
  const nx = (-(by - ay) / length) * half;
  const ny = ((bx - ax) / length) * half;
  // Two triangles, written out one vertex at a time: this runs for every segment of every
  // ribbon on every frame, so it builds no list of corners.
  put(out, at, ax + nx, ay + ny, height);
  put(out, at + 3, ax - nx, ay - ny, height);
  put(out, at + 6, bx - nx, by - ny, height);
  put(out, at + 9, ax + nx, ay + ny, height);
  put(out, at + 12, bx - nx, by - ny, height);
  put(out, at + 15, bx + nx, by + ny, height);
  return at + 18;
}

/**
 * Write a ribbon through `count` points of `xy` (x, y pairs in pitch metres). `closed` joins
 * the last point to the first; `dash` breaks the ribbon into dashes measured along it.
 * Returns the number of floats written (a multiple of 9: whole triangles).
 */
export function ribbonInto(
  xy: ArrayLike<number>,
  count: number,
  options: { width: number; height: number; closed?: boolean; dash?: Dash | null },
  out: Float32Array,
  start = 0,
): number {
  const { width, height, closed = false, dash = null } = options;
  const half = width / 2;
  const segments = closed && count > 2 ? count : count - 1;
  let at = start;
  let travelled = 0;
  for (let s = 0; s < segments; s += 1) {
    const e = (s + 1) % count;
    const ax = xy[s * 2] ?? 0;
    const ay = xy[s * 2 + 1] ?? 0;
    const bx = xy[e * 2] ?? 0;
    const by = xy[e * 2 + 1] ?? 0;
    if (dash === null) {
      at = quad(out, at, ax, ay, bx, by, half, height);
      continue;
    }
    const length = Math.hypot(bx - ax, by - ay);
    const period = dash.on + dash.off;
    let along = 0;
    while (along < length) {
      const phase = (travelled + along) % period;
      const step = Math.min(length - along, phase < dash.on ? dash.on - phase : period - phase);
      if (phase < dash.on && length > 0) {
        const f0 = along / length;
        const f1 = (along + step) / length;
        at = quad(
          out,
          at,
          ax + (bx - ax) * f0,
          ay + (by - ay) * f0,
          ax + (bx - ax) * f1,
          ay + (by - ay) * f1,
          half,
          height,
        );
      }
      along += Math.max(step, 1e-6);
    }
    travelled += length;
  }
  return at - start;
}

/** A filled convex polygon as a triangle fan, same axes as the ribbons. Returns floats written. */
export function fanInto(
  xy: ArrayLike<number>,
  count: number,
  height: number,
  out: Float32Array,
): number {
  let at = 0;
  for (let i = 1; i + 1 < count && at + 9 <= out.length; i += 1) {
    put(out, at, xy[0] ?? 0, xy[1] ?? 0, height);
    put(out, at + 3, xy[i * 2] ?? 0, xy[i * 2 + 1] ?? 0, height);
    put(out, at + 6, xy[i * 2 + 2] ?? 0, xy[i * 2 + 3] ?? 0, height);
    at += 9;
  }
  return at;
}
