import type { Point, SequenceStep } from '../../engine/pro';

/** The ball's route through a build-up: each action's start and end, repeats dropped. */
export function ballPath(steps: readonly SequenceStep[]): Point[] {
  const points: Point[] = [];
  for (const step of steps) {
    for (const point of [step.from, step.to]) {
      const last = points[points.length - 1];
      if (last?.x !== point.x || last.y !== point.y) points.push(point);
    }
  }
  return points;
}

/** Distances along a path, starting at 0. */
export function cumulative(points: readonly Point[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const previous = lengths[i - 1] ?? 0;
    lengths.push(
      a === undefined || b === undefined ? previous : previous + Math.hypot(b.x - a.x, b.y - a.y),
    );
  }
  return lengths;
}

/**
 * The ball and the drawn part of the path at `progress` (0 to 1) along the route, by distance,
 * so a long ball takes longer than a short pass. Pure: the same progress always draws the same.
 */
export function pathAt(
  points: readonly Point[],
  progress: number,
): { readonly ball: Point | null; readonly drawn: Point[] } {
  const first = points[0];
  if (first === undefined) return { ball: null, drawn: [] };
  const lengths = cumulative(points);
  const total = lengths[lengths.length - 1] ?? 0;
  const p = Math.min(Math.max(Number.isFinite(progress) ? progress : 1, 0), 1);
  if (total === 0 || p >= 1)
    return { ball: points[points.length - 1] ?? first, drawn: [...points] };
  const target = p * total;
  const drawn: Point[] = [first];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] ?? first;
    const b = points[i] ?? a;
    const start = lengths[i - 1] ?? 0;
    const end = lengths[i] ?? start;
    if (target >= end) {
      drawn.push(b);
      continue;
    }
    const share = end === start ? 1 : (target - start) / (end - start);
    const ball = { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share };
    drawn.push(ball);
    return { ball, drawn };
  }
  return { ball: points[points.length - 1] ?? first, drawn };
}

/** Seconds a replay lasts: about 0.6 s per action, at least two seconds. */
export function replaySeconds(steps: readonly SequenceStep[]): number {
  return Math.max(2, steps.length * 0.6);
}

/**
 * Which side of its node each name label goes, so names of players standing close together do
 * not print over each other: below by default, above when the spot below is taken by a label
 * placed earlier (the nodes come most passes first, so the busiest players keep the usual place).
 * `near` is how close two labels may sit, in pitch percent along and across.
 */
export function labelSides(
  points: readonly Point[],
  near: Point = { x: 12, y: 8 },
): ('below' | 'above')[] {
  const placed: { readonly x: number; readonly y: number }[] = [];
  return points.map((point) => {
    const clash = (y: number) =>
      placed.some(
        (other) => Math.abs(other.x - point.x) < near.x && Math.abs(other.y - y) < near.y,
      );
    const below = point.y + near.y;
    const above = point.y - near.y;
    const side = clash(below) && !clash(above) ? 'above' : 'below';
    placed.push({ x: point.x, y: side === 'below' ? below : above });
    return side;
  });
}

/** "K. Mbappé" to "Mbappé"; a name without initials stays whole. */
export function surname(name: string): string {
  const match = /^(?:\S+\.\s+)+(.+)$/.exec(name);
  return match?.[1] ?? name;
}
