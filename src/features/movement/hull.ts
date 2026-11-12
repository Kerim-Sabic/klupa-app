/**
 * The convex hull for the 3D frame loop. `convexHull` in model.ts sorts and builds arrays,
 * which is fine a few times a second for the flat pitch; drawn sixty times a second it would
 * feed the garbage collector. This one works on buffers that are allocated once.
 */
export interface HullScratch {
  readonly order: Uint8Array;
  readonly stack: Uint8Array;
}

export function createHullScratch(capacity: number): HullScratch {
  return { order: new Uint8Array(capacity), stack: new Uint8Array(capacity * 2) };
}

const at = (values: Float32Array | Uint8Array, index: number) => values[index] ?? 0;

/** True when point `a` sorts before point `b`: by x, then by y. */
function before(xy: Float32Array, a: number, b: number): boolean {
  const dx = at(xy, a * 2) - at(xy, b * 2);
  return dx < 0 || (dx === 0 && at(xy, a * 2 + 1) < at(xy, b * 2 + 1));
}

function cross(xy: Float32Array, o: number, a: number, b: number): number {
  return (
    (at(xy, a * 2) - at(xy, o * 2)) * (at(xy, b * 2 + 1) - at(xy, o * 2 + 1)) -
    (at(xy, a * 2 + 1) - at(xy, o * 2 + 1)) * (at(xy, b * 2) - at(xy, o * 2))
  );
}

/**
 * Convex hull of the first `count` x, y pairs in `xy`, counter-clockwise and without collinear
 * points (Andrew's monotone chain, the same answer as `convexHull`), written as pairs into
 * `out`. Returns the number of hull points. At most `scratch.order.length` points are read.
 */
export function hullInto(
  xy: Float32Array,
  count: number,
  scratch: HullScratch,
  out: Float32Array,
): number {
  const { order, stack } = scratch;
  const n = Math.max(0, Math.min(count, order.length, Math.floor(xy.length / 2)));
  for (let i = 0; i < n; i += 1) order[i] = i;
  // Insertion sort: at most sixteen points, already nearly in order from one frame to the next.
  for (let i = 1; i < n; i += 1) {
    const key = at(order, i);
    let j = i - 1;
    while (j >= 0 && before(xy, key, at(order, j))) {
      order[j + 1] = at(order, j);
      j -= 1;
    }
    order[j + 1] = key;
  }
  let size = 0;
  if (n < 3) {
    for (let i = 0; i < n; i += 1) stack[size++] = at(order, i);
  } else {
    for (let i = 0; i < n; i += 1) {
      const point = at(order, i);
      while (size >= 2 && cross(xy, at(stack, size - 2), at(stack, size - 1), point) <= 0)
        size -= 1;
      stack[size++] = point;
    }
    const lower = size + 1;
    for (let i = n - 2; i >= 0; i -= 1) {
      const point = at(order, i);
      while (size >= lower && cross(xy, at(stack, size - 2), at(stack, size - 1), point) <= 0)
        size -= 1;
      stack[size++] = point;
    }
    // The walk ends where it began: drop the repeated first point.
    size -= 1;
  }
  const written = Math.min(size, Math.floor(out.length / 2));
  for (let i = 0; i < written; i += 1) {
    const point = at(stack, i);
    out[i * 2] = at(xy, point * 2);
    out[i * 2 + 1] = at(xy, point * 2 + 1);
  }
  return written;
}
