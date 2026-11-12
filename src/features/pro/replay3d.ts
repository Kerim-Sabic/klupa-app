import type { SequenceStep, TeamIndex } from '../../engine/pro';
import { PITCH_M } from './ProPitch';

/*
 * The goal build-up for the 3D view, as pure functions of progress (0 to 1): the ball's
 * position in metres with a small arc on crosses, shots and long balls, and where the camera
 * wants to be. Three.js axes as in the movement replay: x along the pitch, y up, z across.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Segment {
  readonly from: Vec3;
  readonly to: Vec3;
  /** Highest point of the arc above the grass, metres. */
  readonly peak: number;
  readonly length: number;
}

const BALL_RADIUS = 0.22;
const LONG_BALL_M = 30;

/** A common-frame percent point on the grass, in metres from the centre spot. */
export function toMetres(point: { readonly x: number; readonly y: number }): Vec3 {
  return {
    x: (point.x / 100 - 0.5) * PITCH_M.length,
    y: BALL_RADIUS,
    z: (point.y / 100 - 0.5) * PITCH_M.width,
  };
}

function peakFor(step: SequenceStep, length: number): number {
  if (step.cross) return 3.5;
  if (step.kind === 'shot') return step.header ? 0.6 : 1.1;
  return length > LONG_BALL_M ? 2.4 : 0;
}

/** The route as segments: each action's flight, and a carry on the grass between actions. */
export function segmentsOf(steps: readonly SequenceStep[]): Segment[] {
  const segments: Segment[] = [];
  const push = (from: Vec3, to: Vec3, peak: (length: number) => number) => {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length > 0) segments.push({ from, to, peak: peak(length), length });
  };
  steps.forEach((step, i) => {
    const previous = steps[i - 1];
    if (previous !== undefined) push(toMetres(previous.to), toMetres(step.from), () => 0);
    push(toMetres(step.from), toMetres(step.to), (length) => peakFor(step, length));
  });
  return segments;
}

/** The ball at a share of the route, by distance; null when there is no route to follow. */
export function ballAt(steps: readonly SequenceStep[], progress: number): Vec3 | null {
  const segments = segmentsOf(steps);
  const first = steps[0];
  if (segments.length === 0) return first === undefined ? null : toMetres(first.to);
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let target = Math.min(Math.max(Number.isFinite(progress) ? progress : 1, 0), 1) * total;
  for (const segment of segments) {
    if (target <= segment.length) {
      const s = target / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * s,
        y: BALL_RADIUS + 4 * segment.peak * s * (1 - s),
        z: segment.from.z + (segment.to.z - segment.from.z) * s,
      };
    }
    target -= segment.length;
  }
  const last = segments[segments.length - 1];
  return last === undefined ? null : last.to;
}

/**
 * Where the camera wants to be for a ball: behind the attack and above it, looking a little
 * ahead, so the move runs away from the viewer towards the goal it ends in. The home team
 * attacks +x in the common frame, the away team -x.
 */
export function cameraFor(
  ball: Vec3,
  team: TeamIndex,
): { readonly position: Vec3; readonly target: Vec3 } {
  const forward = team === 0 ? 1 : -1;
  return {
    position: { x: ball.x - forward * 24, y: 15, z: ball.z * 0.5 + 16 },
    target: { x: ball.x + forward * 10, y: 0, z: ball.z * 0.6 },
  };
}

/** Move `from` a share `k` of the way to `to`: the camera eases instead of jumping. */
export function easeTowards(from: Vec3, to: Vec3, k: number): Vec3 {
  const s = Math.min(Math.max(k, 0), 1);
  return {
    x: from.x + (to.x - from.x) * s,
    y: from.y + (to.y - from.y) * s,
    z: from.z + (to.z - from.z) * s,
  };
}
