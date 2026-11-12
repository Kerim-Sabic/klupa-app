import {
  POSE_LANDMARK_COUNT,
  type Foot,
  type Point3,
  type PoseFrame,
  type PoseLandmark,
} from '../../engine/pose';

/**
 * A parametric kicking skeleton in MediaPipe world space (metres, hips at the origin,
 * +y down). Side-on: the kicker moves towards +x. It powers the example on the page
 * and gives the engine tests a motion whose answers are known in advance.
 */
export interface KickOptions {
  readonly fps?: number;
  readonly duration?: number;
  /** Time of peak foot speed, in seconds. */
  readonly strikeTime?: number;
  /** Top of backswing to strike, in seconds. */
  readonly swing?: number;
  readonly foot?: Foot;
  /** Interior kicking-knee angle at the top of the backswing, degrees. */
  readonly backswingKnee?: number;
  /** Thigh angle from vertical at the end of the follow-through, degrees. */
  readonly followThrough?: number;
  /** Trunk lean, degrees; positive is forward over the ball. */
  readonly trunkLean?: number;
  /** Plant ankle relative to the kicking ankle at the strike: along the kick, and across. */
  readonly plantForward?: number;
  readonly plantSide?: number;
  /** Shoulders turned against the hips at the top of the backswing, degrees. */
  readonly separation?: number;
  /** Uniform noise added to every coordinate, metres (seeded, so repeatable). */
  readonly noise?: number;
  readonly seed?: number;
  readonly visibility?: number;
  /** A figure that stands still: there is no strike to find. */
  readonly still?: boolean;
}

type Options = Required<KickOptions>;

const RAD = Math.PI / 180;
const THIGH = 0.44;
const SHANK = 0.42;
const HIP_HALF = 0.1;

const smooth = (u: number): number => {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const add = (a: Point3, b: Point3): Point3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Point3, s: number): Point3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const length = (a: Point3): number => Math.hypot(a.x, a.y, a.z);

/** Deterministic PRNG (mulberry32) so a noisy example is the same every time. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The BlazePose index on the other side of the body (eyes, ears, mouth, limbs). */
export function partnerIndex(i: number): number {
  if (i === 0) return 0;
  if (i <= 3) return i + 3;
  if (i <= 6) return i - 3;
  return i % 2 === 1 ? i + 1 : i - 1;
}

/** Thigh angle from vertical and knee flexion (both degrees) for the kicking leg at time t. */
function kickingLeg(t: number, o: Options): { thigh: number; flex: number } {
  if (o.still) return { thigh: 2 * Math.sin(t * 2), flex: 6 };
  const top = o.strikeTime - o.swing;
  const end = o.strikeTime + o.swing;
  const backFlex = 180 - o.backswingKnee;
  const stride = 8 * Math.sin(t * 7);
  if (t < top - 0.3) return { thigh: stride, flex: 20 + stride };
  if (t < top) {
    const u = smooth((t - (top - 0.3)) / 0.3);
    return { thigh: lerp(stride, -30, u), flex: lerp(20 + stride, backFlex, u) };
  }
  if (t < end) {
    const thigh = lerp(-30, o.followThrough, smooth((t - top) / (end - top)));
    return { thigh, flex: lerp(backFlex, 8, smooth((t - top) / (1.5 * o.swing))) };
  }
  const u = smooth((t - end) / 0.5);
  return { thigh: lerp(o.followThrough, 0, u), flex: lerp(8, 10, u) };
}

function legAt(hip: Point3, t: number, o: Options): { knee: Point3; ankle: Point3 } {
  const { thigh, flex } = kickingLeg(t, o);
  const knee = add(hip, {
    x: THIGH * Math.sin(thigh * RAD),
    y: THIGH * Math.cos(thigh * RAD),
    z: 0,
  });
  const shank = (thigh - flex) * RAD;
  return {
    knee,
    ankle: add(knee, { x: SHANK * Math.sin(shank), y: SHANK * Math.cos(shank), z: 0 }),
  };
}

/** Two-bone leg reaching from hip to ankle with the knee bending forward (+x). */
function plantKnee(hip: Point3, ankle: Point3): Point3 {
  const d = add(ankle, scale(hip, -1));
  const reach = Math.min(length(d), THIGH + SHANK - 1e-6);
  const dir = scale(d, 1 / length(d));
  const along = (THIGH * THIGH - SHANK * SHANK + reach * reach) / (2 * reach);
  const out = Math.sqrt(Math.max(0, THIGH * THIGH - along * along));
  const fwd = { x: 1 - dir.x * dir.x, y: -dir.x * dir.y, z: -dir.x * dir.z };
  return add(add(hip, scale(dir, along)), scale(fwd, out / (length(fwd) || 1)));
}

function footPoints(ankle: Point3, knee: Point3): { heel: Point3; toe: Point3 } {
  const shin = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const l = Math.hypot(shin.x, shin.y) || 1;
  const toe = { x: (shin.y / l) * 0.16, y: (-shin.x / l) * 0.16 };
  return {
    heel: add(ankle, { x: -toe.x * 0.4, y: 0.05, z: 0 }),
    toe: add(ankle, { x: toe.x, y: toe.y + 0.05, z: 0 }),
  };
}

const DEFAULTS: Options = {
  fps: 30,
  duration: 2.4,
  strikeTime: 1.3,
  swing: 0.16,
  foot: 'right',
  backswingKnee: 75,
  followThrough: 80,
  trunkLean: 4,
  plantForward: -0.05,
  plantSide: 0.28,
  separation: 22,
  noise: 0,
  seed: 7,
  visibility: 0.95,
  still: false,
};

/** One right-footed skeleton at time t, before noise. Index order follows BlazePose. */
function skeleton(t: number, o: Options): Point3[] {
  const kickHip = { x: 0, y: 0, z: -HIP_HALF };
  const plantHip = { x: 0, y: 0, z: HIP_HALF };
  const leg = legAt(kickHip, t, o);
  const strikeAnkle = o.still
    ? { x: 0, y: 0.85, z: -HIP_HALF }
    : legAt(kickHip, o.strikeTime, o).ankle;
  const plantAnkle = {
    x: strikeAnkle.x + (o.still ? 0 : o.plantForward),
    y: 0.84,
    z: o.still ? HIP_HALF : strikeAnkle.z + o.plantSide,
  };
  const plant = { knee: plantKnee(plantHip, plantAnkle), ankle: plantAnkle };
  const top = o.strikeTime - o.swing;
  const turn = o.still
    ? 0
    : o.separation * RAD * Math.max(0, 1 - Math.abs(t - top) / (3 * o.swing));
  const lean = o.trunkLean * RAD;
  const neck = { x: 0.5 * Math.sin(lean), y: -0.5 * Math.cos(lean), z: 0 };
  const shoulder = (sign: number): Point3 =>
    add(neck, { x: -0.18 * sign * Math.sin(turn), y: 0, z: 0.18 * sign * Math.cos(turn) });
  const nose = add(neck, { x: 0.08, y: -0.2, z: 0 });
  const points: Point3[] = Array.from({ length: POSE_LANDMARK_COUNT }, () => nose);
  const face = [0.03, 0.035, 0.04, -0.03, -0.035, -0.04, 0.07, -0.07, 0.02, -0.02];
  face.forEach((dz, i) => {
    points[i + 1] = add(nose, { x: -0.02, y: i < 6 ? -0.03 : i < 8 ? 0 : 0.04, z: dz });
  });
  // Left (plant) side on odd indices, right (kicking) side on even ones.
  const sides = [
    { offset: 0, shoulder: shoulder(1), out: 0.16, hip: plantHip, leg: plant },
    { offset: 1, shoulder: shoulder(-1), out: -0.08, hip: kickHip, leg },
  ];
  for (const side of sides) {
    const elbow = add(side.shoulder, { x: 0.05, y: 0.26, z: side.out });
    const wrist = add(elbow, { x: 0.08, y: 0.22, z: side.out * 0.75 });
    const foot = footPoints(side.leg.ankle, side.leg.knee);
    const set = (index: number, point: Point3) => {
      points[index + side.offset] = point;
    };
    set(11, side.shoulder);
    set(13, elbow);
    set(15, wrist);
    for (const hand of [17, 19, 21]) set(hand, add(wrist, { x: 0.03, y: 0.06, z: 0 }));
    set(23, side.hip);
    set(25, side.leg.knee);
    set(27, side.leg.ankle);
    set(29, foot.heel);
    set(31, foot.toe);
  }
  return points;
}

function swapSides<T>(points: readonly T[], transform: (point: T) => T): T[] {
  return points.map((point, i) => transform(points[partnerIndex(i)] ?? point));
}

/** Frames of a synthetic kick (or a still figure) with optional seeded noise. */
export function synthesizeKick(options: KickOptions = {}): PoseFrame[] {
  const o: Options = { ...DEFAULTS, ...options };
  const random = prng(o.seed);
  const jitter = (): number => (random() * 2 - 1) * o.noise;
  const count = Math.round(o.duration * o.fps);
  return Array.from({ length: count }, (_, i) => {
    const time = i / o.fps;
    const raw = skeleton(time, o);
    // A left-footed kick is the same body reflected through its own midline (z), relabelled.
    const body = o.foot === 'left' ? swapSides(raw, (p) => ({ ...p, z: -p.z })) : raw;
    const world = body.map((p): PoseLandmark => ({
      x: p.x + jitter(),
      y: p.y + jitter(),
      z: p.z + jitter(),
      visibility: o.visibility,
    }));
    return { time, world, people: 1 };
  });
}
