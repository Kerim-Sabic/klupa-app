import {
  clampOrbit,
  FOV_DEGREES,
  orbitPosition,
  presetOrbit,
  type CameraPreset,
  type Orbit,
} from './pitch';

/**
 * Fitting the camera to the stage. A fixed distance left the side-on pitch in the middle
 * 40% of a phone's canvas; here the camera is moved until the pitch (with a little margin
 * and the height of the markers) just fits, and the canvas takes the shape of what it shows.
 */
type Vec = readonly [number, number, number];

const HALF_LENGTH = 52.5 + 1.5;
const HALF_WIDTH = 34 + 1.5;
/** Grass corners and the same corners at marker-label height, so far-side numbers stay in. */
export const PITCH_BOX: readonly Vec[] = [0, 4.5].flatMap((height) =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz): Vec => [sx * HALF_LENGTH, height, sz * HALF_WIDTH])),
);

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normalise(v: Vec): Vec {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  /** False when a point is behind the camera, so the bounds mean nothing. */
  readonly inFront: boolean;
}

/** Where points land on screen, in normalised device coordinates (-1 to 1 on both axes). */
export function project(orbit: Orbit, aspect: number, points: readonly Vec[]): Bounds {
  const eye = orbitPosition(orbit);
  const forward = normalise([orbit.targetX - eye[0], -eye[1], orbit.targetZ - eye[2]]);
  // As three.js's lookAt with "up" = +y: right = forward x up, camera up = right x forward.
  const right = normalise([-forward[2], 0, forward[0]]);
  const up: Vec = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const tanV = Math.tan((FOV_DEGREES * Math.PI) / 360);
  const tanH = tanV * aspect;
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  let inFront = true;
  for (const point of points) {
    const d: Vec = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    const depth = dot(d, forward);
    if (depth <= 0.5) inFront = false;
    const x = dot(d, right) / (Math.max(depth, 0.5) * tanH);
    const y = dot(d, up) / (Math.max(depth, 0.5) * tanV);
    [minX, maxX, minY, maxY] = [
      Math.min(minX, x),
      Math.max(maxX, x),
      Math.min(minY, y),
      Math.max(maxY, y),
    ];
  }
  return { minX, maxX, minY, maxY, inFront };
}

/** Move and zoom the camera until the points fill the frame up to `fill` of it, centred. */
export function fitOrbit(start: Orbit, aspect: number, points: readonly Vec[], fill = 0.94): Orbit {
  const tanV = Math.tan((FOV_DEGREES * Math.PI) / 360);
  let orbit = start;
  for (let i = 0; i < 60; i += 1) {
    const b = project(orbit, aspect, points);
    if (!b.inFront) {
      orbit = { ...orbit, distance: orbit.distance * 1.4 };
      continue;
    }
    const scaleX = (b.maxX - b.minX) / (2 * fill);
    const scaleY = (b.maxY - b.minY) / (2 * fill);
    const scale = Math.max(scaleX, scaleY);
    const cx = (b.maxX + b.minX) / 2;
    const cy = (b.maxY + b.minY) / 2;
    // Slide the aim on the grass: sideways for x, along the view for y.
    const side = cx * orbit.distance * tanV * aspect * 0.8;
    const along = (cy * orbit.distance * tanV * 0.8) / Math.max(0.2, Math.sin(orbit.elevation));
    const [sa, ca] = [Math.sin(orbit.azimuth), Math.cos(orbit.azimuth)];
    orbit = {
      ...orbit,
      // Camera right on the grass is (cos a, -sin a); the view runs along (-sin a, -cos a).
      targetX: orbit.targetX + side * ca - along * sa,
      targetZ: orbit.targetZ - side * sa - along * ca,
      distance: orbit.distance * Math.pow(scale, 0.8),
    };
    if (Math.abs(scale - 1) < 0.002 && Math.abs(cx) < 0.002 && Math.abs(cy) < 0.002) break;
  }
  return clampOrbit(orbit);
}

export interface StageView {
  readonly orbit: Orbit;
  /** Width over height for the canvas. */
  readonly aspect: number;
}

/** Narrow screens look down a little more steeply side-on, so the pitch has some height. */
const NARROW_PX = 640;
const ASPECT_RANGE: Readonly<Record<CameraPreset, readonly [number, number]>> = {
  broadcast: [1.25, 2],
  tactical: [1.25, 1.75],
  goal: [1.1, 1.5],
  follow: [1.5, 1.9],
};

/**
 * The camera and canvas shape for a preset on a stage `widthPx` wide: the canvas takes the
 * shape of the fitted pitch (within limits, so it is never a sliver), then the camera is
 * fitted again to that exact shape. The follow camera is not fitted to the pitch: it shows a
 * part of it, wide on a wide stage and squarer (and a little steeper) on a phone.
 */
export function stageView(preset: CameraPreset, widthPx: number, end: 1 | -1): StageView {
  const narrow = widthPx < NARROW_PX;
  const [low, high] = ASPECT_RANGE[preset];
  if (preset === 'follow') {
    const aspect = narrow ? low : high;
    const orbit = presetOrbit('follow', aspect);
    return { orbit: narrow ? { ...orbit, elevation: orbit.elevation + 0.12 } : orbit, aspect };
  }
  const base = presetOrbit(preset, (low + high) / 2, end);
  const tilted =
    preset === 'broadcast' && narrow ? { ...base, elevation: base.elevation + 0.22 } : base;
  const tactical = preset === 'tactical' ? { ...tilted, azimuth: 0 } : tilted;
  const first = fitOrbit(tactical, high, PITCH_BOX);
  const b = project(first, high, PITCH_BOX);
  const ratio = ((b.maxX - b.minX) / (b.maxY - b.minY)) * high;
  const aspect = Math.min(high, Math.max(low, Number.isFinite(ratio) ? ratio : low));
  return { orbit: fitOrbit(first, aspect, PITCH_BOX), aspect };
}
