/**
 * Pitch geometry in metres from the centre spot (x along the length, y across), shared by
 * the flat SVG pitch and the 3D scene, and the camera presets of the 3D view. No three.js
 * here, so the flat view and the tests never download it.
 */

export type Point = { readonly x: number; readonly y: number };
export type Polyline = readonly Point[];

/** Laws of the Game, Law 1, in metres. */
export const LAW = {
  centreCircle: 9.15,
  penaltyAreaDepth: 16.5,
  penaltyAreaWidth: 40.32,
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  penaltyMark: 11,
  cornerArc: 1,
  goalWidth: 7.32,
  goalHeight: 2.44,
} as const;

function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / steps;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];
}

/** Every line on the pitch as polylines, plus the centre and penalty spots. */
export function pitchMarkings(
  length: number,
  width: number,
  steps = 48,
): { lines: Polyline[]; spots: Point[] } {
  const hl = length / 2;
  const hw = width / 2;
  const lines: Polyline[] = [
    rect(-hl, -hw, hl, hw),
    [
      { x: 0, y: -hw },
      { x: 0, y: hw },
    ],
    arc(0, 0, LAW.centreCircle, 0, 2 * Math.PI, steps * 2),
  ];
  const spots: Point[] = [{ x: 0, y: 0 }];
  // The penalty arc is the part of the circle round the mark that lies outside the area.
  const reach = Math.acos((LAW.penaltyAreaDepth - LAW.penaltyMark) / LAW.centreCircle);
  for (const end of [-1, 1] as const) {
    const line = end * hl;
    const inward = -end;
    const box = (depth: number, span: number) =>
      rect(line, -span / 2, line + inward * depth, span / 2);
    lines.push(box(LAW.penaltyAreaDepth, LAW.penaltyAreaWidth));
    lines.push(box(LAW.goalAreaDepth, LAW.goalAreaWidth));
    const mark = line + inward * LAW.penaltyMark;
    spots.push({ x: mark, y: 0 });
    const facing = end === 1 ? Math.PI : 0;
    lines.push(arc(mark, 0, LAW.centreCircle, facing - reach, facing + reach, steps / 2));
    for (const side of [-1, 1] as const) {
      // A corner arc is the quarter turn from "into the pitch along the touchline"
      // to "into the pitch along the goal line".
      const start = end === 1 ? Math.PI : 0;
      const target = (-side * Math.PI) / 2;
      const sweep = Math.atan2(Math.sin(target - start), Math.cos(target - start));
      lines.push(arc(line, side * hw, LAW.cornerArc, start, start + sweep, 8));
    }
  }
  return { lines, spots };
}

export type CameraPreset = 'broadcast' | 'tactical' | 'goal' | 'follow';
export const CAMERA_PRESETS: readonly CameraPreset[] = ['broadcast', 'tactical', 'goal', 'follow'];

/** A camera on a sphere round a target on the grass. Three.js axes: x = pitch x, y up, z = -pitch y. */
export interface Orbit {
  readonly targetX: number;
  readonly targetZ: number;
  /** Around the vertical axis; 0 puts the camera on the near touchline (+z). */
  readonly azimuth: number;
  /** Above the grass, in radians. */
  readonly elevation: number;
  readonly distance: number;
}

export const FOV_DEGREES = 35;
const MIN_ELEVATION = 0.08;
/** Just short of straight down, so "up" on screen stays the far touchline. */
export const MAX_ELEVATION = Math.PI / 2 - 0.002;
const MIN_DISTANCE = 12;
const MAX_DISTANCE = 320;

export function clampOrbit(orbit: Orbit): Orbit {
  return {
    ...orbit,
    elevation: Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, orbit.elevation)),
    distance: Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, orbit.distance)),
  };
}

/** Half the width of grass the follow camera keeps in view, in metres. */
const FOLLOW_HALF_SPAN = 24;
/** The follow camera's aim stays this far inside the pitch, so it never films the stands. */
const FOLLOW_REACH_X = 34;
const FOLLOW_REACH_Z = 12;

/** Where the follow camera aims along the pitch for a ball at `x`: the ball, held inside the pitch. */
export function followAimX(x: number): number {
  return Math.min(FOLLOW_REACH_X, Math.max(-FOLLOW_REACH_X, x));
}

/** The same across the pitch, for a ball at three.js `z`. */
export function followAimZ(z: number): number {
  return Math.min(FOLLOW_REACH_Z, Math.max(-FOLLOW_REACH_Z, z));
}

/** How far away a camera must be for a span of `half * 2` metres to fit the given half-angle. */
function fit(half: number, halfAngle: number): number {
  return half / Math.tan(halfAngle);
}

/**
 * The presets for a canvas of the given aspect (width / height). `end` is the goal the
 * behind-the-goal camera stands behind: -1 for the left goal, 1 for the right one. The
 * follow camera starts over the centre spot; the frame loop then keeps its aim on the ball.
 */
export function presetOrbit(preset: CameraPreset, aspect: number, end: 1 | -1 = -1): Orbit {
  const vHalf = (FOV_DEGREES * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.3, aspect));
  if (preset === 'tactical') {
    // On a portrait canvas the pitch is turned so its length runs up the screen.
    const portrait = aspect < 1;
    const distance = portrait
      ? Math.max(fit(56, vHalf), fit(37, hHalf))
      : Math.max(fit(56, hHalf), fit(37, vHalf));
    const azimuth = portrait ? Math.PI / 2 : 0;
    return clampOrbit({ targetX: 0, targetZ: 0, azimuth, elevation: MAX_ELEVATION, distance });
  }
  if (preset === 'goal') {
    // Stand behind the goal line, looking up the pitch over the penalty area.
    return clampOrbit({
      targetX: end * 22,
      targetZ: 0,
      azimuth: (end * Math.PI) / 2,
      elevation: 0.62,
      distance: 58 + fit(20, hHalf) * 0.2,
    });
  }
  if (preset === 'follow') {
    // Side-on and close: about a third of the pitch in view, the rest follows the ball.
    return clampOrbit({
      targetX: 0,
      targetZ: 0,
      azimuth: 0,
      elevation: 0.5,
      distance: fit(FOLLOW_HALF_SPAN, hHalf),
    });
  }
  // Side-on from the main stand: the whole length in view, slightly from above.
  return clampOrbit({
    targetX: 0,
    targetZ: 2,
    azimuth: 0,
    elevation: 0.72,
    distance: fit(56, hHalf) * 0.98,
  });
}

/** Where the camera sits for an orbit. */
export function orbitPosition(orbit: Orbit): [number, number, number] {
  const flat = Math.cos(orbit.elevation) * orbit.distance;
  return [
    orbit.targetX + Math.sin(orbit.azimuth) * flat,
    Math.sin(orbit.elevation) * orbit.distance,
    orbit.targetZ + Math.cos(orbit.azimuth) * flat,
  ];
}

/** Turn by a drag of `dx`, `dy` pixels, or zoom by `factor` (pinch, Ctrl + wheel). */
export function orbitBy(orbit: Orbit, dx: number, dy: number, factor = 1): Orbit {
  return clampOrbit({
    ...orbit,
    azimuth: orbit.azimuth - dx * 0.006,
    elevation: orbit.elevation + dy * 0.006,
    distance: orbit.distance * factor,
  });
}

/** An orbit the frame loop moves in place, so a gliding camera allocates nothing. */
export type MovingOrbit = { -readonly [K in keyof Orbit]: Orbit[K] };

/**
 * One step of the camera gliding towards its goal, in place. `k` is the share of the gap
 * closed this frame (0 to 1, 1 jumps). The aim on the grass can be given apart from the goal
 * (the follow camera aims at the ball) and closes by `kAim`, usually slower, so the picture
 * does not jerk with every touch of the ball. Turns go the short way round.
 * Returns true once the camera is close enough to stop asking for frames.
 */
export function glideOrbit(
  orbit: MovingOrbit,
  goal: Orbit,
  k: number,
  aimX = goal.targetX,
  aimZ = goal.targetZ,
  kAim = k,
): boolean {
  const turn = Math.atan2(
    Math.sin(goal.azimuth - orbit.azimuth),
    Math.cos(goal.azimuth - orbit.azimuth),
  );
  orbit.targetX += (aimX - orbit.targetX) * kAim;
  orbit.targetZ += (aimZ - orbit.targetZ) * kAim;
  orbit.azimuth += turn * k;
  orbit.elevation += (goal.elevation - orbit.elevation) * k;
  orbit.distance += (goal.distance - orbit.distance) * k;
  return (
    Math.abs(orbit.targetX - aimX) < 0.01 &&
    Math.abs(orbit.targetZ - aimZ) < 0.01 &&
    Math.abs(Math.sin(orbit.azimuth - goal.azimuth)) < 1e-4 &&
    Math.abs(orbit.elevation - goal.elevation) < 1e-4 &&
    Math.abs(orbit.distance - goal.distance) < 0.01
  );
}
