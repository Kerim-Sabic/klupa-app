import {
  analyseShot,
  jointAngle,
  kneeAngle,
  type Foot,
  type Point3,
  type PoseFrame,
  type StrikeFound,
} from '../../engine/pose';

/**
 * The pure parts of the live camera: what to keep, when to run the detector, how to
 * steady the numbers and when to say tracking is lost. No clock and no DOM: every
 * function takes the time it needs as an argument, so all of it is unit-tested.
 */

/** Seconds of landmarks kept for catching a strike. */
export const BUFFER_SECONDS = 3;

/** A fixed-capacity buffer of recent frames, oldest first, never longer than `seconds`. */
export interface FrameRing {
  readonly frames: readonly PoseFrame[];
  readonly seconds: number;
}

export function emptyRing(seconds = BUFFER_SECONDS): FrameRing {
  return { frames: [], seconds };
}

/** Add a frame and drop what is older than the window. Times must increase; others are ignored. */
export function pushFrame(ring: FrameRing, frame: PoseFrame): FrameRing {
  const last = ring.frames[ring.frames.length - 1];
  if (last !== undefined && frame.time <= last.time) return ring;
  const from = frame.time - ring.seconds;
  return { ...ring, frames: [...ring.frames.filter((f) => f.time >= from), frame] };
}

/**
 * At most one inference per animation frame, never while one is running, and only for a
 * video frame that has not been read yet.
 */
export interface Scheduler {
  readonly busy: boolean;
  readonly lastVideoTime: number;
}

export const idleScheduler: Scheduler = { busy: false, lastVideoTime: -1 };

export function shouldInfer(scheduler: Scheduler, videoTime: number): boolean {
  return !scheduler.busy && videoTime !== scheduler.lastVideoTime;
}

/** Exponential smoothing; `null` means "nothing yet" and passes the first value through. */
export function smoothValue(
  previous: number | null,
  next: number | null,
  weight = 0.3,
): number | null {
  if (next === null || !Number.isFinite(next)) return previous;
  if (previous === null) return next;
  return previous + (next - previous) * weight;
}

/** Analysed frames per second over the last second of completion times (ms). */
export function framesPerSecond(completions: readonly number[], now: number): number {
  return completions.filter((t) => t > now - 1000 && t <= now).length;
}

/** Keep only the completion times still useful for the rate. */
export function recentCompletions(completions: readonly number[], now: number): number[] {
  return [...completions.filter((t) => t > now - 1000), now];
}

export const TOO_SLOW_FPS = 5;
export const TOO_SLOW_SECONDS = 3;

/**
 * Too slow when every rate sampled over the last few seconds stayed under the limit.
 * `samples` are [time ms, frames per second] pairs, oldest first.
 */
export function isTooSlow(samples: readonly (readonly [number, number])[], now: number): boolean {
  const first = samples[0];
  if (first === undefined || now - first[0] < TOO_SLOW_SECONDS * 1000) return false;
  const window = samples.filter(([t]) => t >= now - TOO_SLOW_SECONDS * 1000);
  return window.length > 0 && window.every(([, fps]) => fps < TOO_SLOW_FPS);
}

const KEY_POINTS = [11, 12, 23, 24, 25, 26, 27, 28];
export const TRACKING_MIN_VISIBILITY = 0.5;

/** Tracking is lost when nobody is found or the hips, knees, ankles and shoulders are unsure. */
export function isTracking(frame: PoseFrame): boolean {
  const world = frame.world;
  if (world === null) return false;
  const seen = KEY_POINTS.map((i) => world[i]?.visibility ?? 0);
  return seen.reduce((sum, v) => sum + v, 0) / seen.length >= TRACKING_MIN_VISIBILITY;
}

export interface LiveNumbers {
  readonly leftKnee: number | null;
  readonly rightKnee: number | null;
  /** Angle of the hips-to-shoulders line from upright, degrees. */
  readonly trunkLean: number | null;
  /** Ankle speed relative to the hips, m/s. */
  readonly leftFootSpeed: number | null;
  readonly rightFootSpeed: number | null;
}

export const NO_NUMBERS: LiveNumbers = {
  leftKnee: null,
  rightKnee: null,
  trunkLean: null,
  leftFootSpeed: null,
  rightFootSpeed: null,
};

const mid = (a: Point3, b: Point3): Point3 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

function speed(previous: PoseFrame | undefined, current: PoseFrame, index: number): number | null {
  const a = previous?.world?.[index];
  const b = current.world?.[index];
  if (previous === undefined || a === undefined || b === undefined) return null;
  const dt = current.time - previous.time;
  return dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt : null;
}

/** The raw numbers for one frame, from the engine's own geometry. */
export function frameNumbers(previous: PoseFrame | undefined, current: PoseFrame): LiveNumbers {
  const world = current.world;
  if (world === null || !isTracking(current)) return NO_NUMBERS;
  const [ls, rs, lh, rh] = [11, 12, 23, 24].map((i) => world[i]);
  if (ls === undefined || rs === undefined || lh === undefined || rh === undefined)
    return NO_NUMBERS;
  const hips = mid(lh, rh);
  const above = { x: hips.x, y: hips.y - 1, z: hips.z };
  return {
    leftKnee: kneeAngle(world, 'left'),
    rightKnee: kneeAngle(world, 'right'),
    trunkLean: jointAngle(above, hips, mid(ls, rs)),
    leftFootSpeed: speed(previous, current, 27),
    rightFootSpeed: speed(previous, current, 28),
  };
}

/** Smooth every number towards the newest frame's; lost tracking keeps the last values. */
export function smoothNumbers(previous: LiveNumbers, next: LiveNumbers): LiveNumbers {
  return {
    leftKnee: smoothValue(previous.leftKnee, next.leftKnee),
    rightKnee: smoothValue(previous.rightKnee, next.rightKnee),
    trunkLean: smoothValue(previous.trunkLean, next.trunkLean),
    leftFootSpeed: smoothValue(previous.leftFootSpeed, next.leftFootSpeed),
    rightFootSpeed: smoothValue(previous.rightFootSpeed, next.rightFootSpeed),
  };
}

/** Below this, neither foot counts as moving. */
export const MOVING_FOOT_SPEED = 0.5;

/** Which foot moves faster, or null when both are near still or unknown. */
export function fasterFoot(numbers: LiveNumbers): Foot | null {
  const { leftFootSpeed: left, rightFootSpeed: right } = numbers;
  if (left === null || right === null) return null;
  if (Math.max(left, right) < MOVING_FOOT_SPEED) return null;
  return left > right ? 'left' : 'right';
}

export interface CaughtStrike {
  readonly frames: readonly PoseFrame[];
  readonly analysis: StrikeFound;
  /** Time of the strike on the live clock, seconds. */
  readonly at: number;
}

/** Two catches closer than this are the same strike seen again as the window slides. */
const SAME_STRIKE_SECONDS = 1;
/** Wait this long after the strike, so the frozen window holds the follow-through too. */
export const FOLLOW_WAIT_SECONDS = 0.5;

/**
 * Look for a strike in the buffered window with the same detector a filmed clip gets.
 * Returns the frozen window (times restarted at zero) or null, and never the same strike twice.
 */
export function catchStrike(ring: FrameRing, previous: CaughtStrike | null): CaughtStrike | null {
  const first = ring.frames[0];
  const last = ring.frames[ring.frames.length - 1];
  if (first === undefined || last === undefined) return null;
  const analysis = analyseShot(ring.frames);
  if (analysis.kind !== 'strike') return null;
  const at = ring.frames[analysis.strikeFrame]?.time ?? first.time;
  if (last.time - at < FOLLOW_WAIT_SECONDS) return null;
  if (previous !== null && Math.abs(at - previous.at) < SAME_STRIKE_SECONDS) return null;
  const frames = ring.frames.map((f) => ({ ...f, time: f.time - first.time }));
  return { frames, analysis, at };
}
