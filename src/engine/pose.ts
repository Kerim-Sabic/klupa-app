/**
 * Strike analysis from a single phone camera. Pure: no I/O, no clock, no randomness.
 *
 * Input is MediaPipe's 33-point BlazePose skeleton in "world" coordinates: metres,
 * origin between the hips, +y pointing down, z the model's own depth estimate. Because
 * the origin travels with the hips, every speed here is relative to the hips, and every
 * number that leans on z inherits the model's depth guess. Measurements say so.
 * Indices used: 11/12 shoulders, 23/24 hips, 25/26 knees, 27/28 ankles (odd = left).
 */

export const POSE_LANDMARK_COUNT = 33;

export type Foot = 'left' | 'right';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PoseLandmark extends Point3 {
  /** Model's 0..1 belief that the point is in view and not hidden. */
  readonly visibility: number;
}

export interface PoseFrame {
  /** Seconds from the start of the clip. Strictly increasing. */
  readonly time: number;
  /** The 33 world landmarks, or null when no body was found in this frame. */
  readonly world: readonly PoseLandmark[] | null;
  /** How many bodies the detector saw (it is asked for up to two). */
  readonly people?: number;
}

export type NotSeenReason =
  | 'too-few-frames'
  | 'body-not-found'
  | 'legs-not-visible'
  | 'more-than-one-person'
  | 'low-visibility';

export type NoStrikeReason = 'too-slow' | 'no-clear-peak' | 'no-backswing';

export type MeasurementId =
  | 'kneeAtBackswing'
  | 'kneeAtStrike'
  | 'hipShoulderSeparation'
  | 'trunkLeanForward'
  | 'trunkLeanSideways'
  | 'plantFrontBack'
  | 'plantSideways'
  | 'peakFootSpeed'
  | 'swingDuration'
  | 'followThroughHeight';

export interface Measurement {
  readonly id: MeasurementId;
  readonly value: number;
  readonly unit: 'deg' | 'm' | 'm/s' | 's';
  /** Frame indices the value was read from, so the coach can go and look. */
  readonly frames: readonly number[];
  /** True when the number leans on the model's estimated depth: treat it more loosely. */
  readonly reliesOnDepth: boolean;
}

export interface StrikeFound {
  readonly kind: 'strike';
  readonly foot: Foot;
  readonly strikeFrame: number;
  readonly backswingFrame: number;
  /** Highest point of the kicking foot after the strike; null when the clip ends too soon. */
  readonly followThroughFrame: number | null;
  readonly confidence: number;
  readonly measurements: readonly Measurement[];
  /** Kicking-ankle speed per frame (m/s, relative to the hips), for the scrubber trace. */
  readonly footSpeed: readonly number[];
}

export type ShotAnalysis =
  | StrikeFound
  | { readonly kind: 'no-strike'; readonly reason: NoStrikeReason; readonly confidence: number }
  | { readonly kind: 'not-seen'; readonly reasons: NotSeenReason[]; readonly confidence: number };

export class PoseInputError extends RangeError {
  override readonly name = 'PoseInputError';
}

/** Thresholds for what counts as seen, and as a strike. */
export const POSE_LIMITS = {
  minFrames: 15,
  minConfidence: 0.5,
  minCoverage: 0.6,
  maxMultiPersonShare: 0.2,
  /** m/s: a standing or jogging figure stays well below this. */
  minPeakSpeed: 3,
  /** The strike must be this much faster than any swing more than `peakExclusion` s away. */
  peakRatio: 1.3,
  peakExclusion: 0.3,
  backswingWindow: 0.6,
  maxBackswingKnee: 135,
  minKneeExtension: 15,
  followWindow: 0.6,
  minFollowSeen: 0.2,
} as const;

const KEY_POINTS = [11, 12, 23, 24, 25, 26, 27, 28];
const LEG_POINTS = [25, 26, 27, 28];
const UPPER_POINTS = [11, 12, 23, 24];
const SIDE_POINTS = {
  left: { hip: 23, knee: 25, ankle: 27 },
  right: { hip: 24, knee: 26, ankle: 28 },
} as const;
const DEG = 180 / Math.PI;

type Poses = readonly (readonly Point3[])[];

const sub = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mix = (a: Point3, b: Point3, w: number): Point3 => ({
  x: a.x + (b.x - a.x) * w,
  y: a.y + (b.y - a.y) * w,
  z: a.z + (b.z - a.z) * w,
});
const dot = (a: Point3, b: Point3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Point3): number => Math.sqrt(dot(a, a));
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const horizontal = (p: Point3, length = Math.hypot(p.x, p.z)): Point3 =>
  length === 0 ? { x: 0, y: 0, z: 0 } : { x: p.x / length, y: 0, z: p.z / length };

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new PoseInputError(`Missing item ${String(index)}.`);
  return item;
}

/** Interior angle at `b` in degrees: 180 is a straight limb. */
export function jointAngle(a: Point3, b: Point3, c: Point3): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const length = norm(u) * norm(v);
  if (length === 0) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / length))) * DEG;
}

export function kneeAngle(pose: readonly Point3[], foot: Foot): number {
  const p = SIDE_POINTS[foot];
  return jointAngle(at(pose, p.hip), at(pose, p.knee), at(pose, p.ankle));
}

function visibilityOf(frame: PoseFrame, points: readonly number[]): number {
  const world = frame.world;
  return world === null ? 0 : mean(points.map((index) => at(world, index).visibility));
}

/** Is the body seen well enough to measure? Returns the reasons it is not. */
export function assessVisibility(frames: readonly PoseFrame[]): {
  readonly confidence: number;
  readonly reasons: NotSeenReason[];
} {
  const L = POSE_LIMITS;
  const n = frames.length;
  const seen = frames.filter((frame) => frame.world !== null);
  const crowded = frames.filter((frame) => (frame.people ?? 1) > 1).length;
  const confidence = mean(frames.map((frame) => visibilityOf(frame, KEY_POINTS)));
  const reasons: NotSeenReason[] = [];
  if (n < L.minFrames) reasons.push('too-few-frames');
  if (crowded > n * L.maxMultiPersonShare) reasons.push('more-than-one-person');
  if (seen.length < n * L.minCoverage)
    return { confidence, reasons: [...reasons, 'body-not-found'] };
  const legs = mean(seen.map((frame) => visibilityOf(frame, LEG_POINTS)));
  const upper = mean(seen.map((frame) => visibilityOf(frame, UPPER_POINTS)));
  if (legs < L.minConfidence && upper >= L.minConfidence) reasons.push('legs-not-visible');
  else if (confidence < L.minConfidence) reasons.push('low-visibility');
  return { confidence, reasons };
}

/**
 * Fill gaps by linear interpolation (holding the ends), then smooth with a centred
 * triangular window about 0.15 s wide. Centred is fine here: a clip is analysed after
 * the fact, and symmetry keeps the timing of the speed peak in place.
 */
export function smoothPoses(frames: readonly PoseFrame[]): Point3[][] {
  const known = frames.flatMap((frame, index) => (frame.world === null ? [] : [index]));
  if (known.length === 0) return [];
  const filled = frames.map((frame, index): readonly Point3[] => {
    if (frame.world !== null) return frame.world;
    const after = known.find((k) => k > index) ?? at(known, known.length - 1);
    const before = [...known].reverse().find((k) => k < index) ?? after;
    const w = after === before ? 0 : (index - before) / (after - before);
    const b = at(frames, after).world ?? [];
    return (at(frames, before).world ?? []).map((p, j) => mix(p, at(b, j), w));
  });
  const span = at(frames, frames.length - 1).time - at(frames, 0).time;
  const radius = Math.max(1, Math.round((span > 0 ? (frames.length - 1) / span : 30) * 0.05));
  return filled.map((pose, index) =>
    pose.map((_, j) => {
      let [x, y, z, total] = [0, 0, 0, 0];
      for (let k = -radius; k <= radius; k += 1) {
        const other = filled[index + k];
        if (other === undefined) continue;
        const w = radius + 1 - Math.abs(k);
        const p = at(other, j);
        [x, y, z, total] = [x + p.x * w, y + p.y * w, z + p.z * w, total + w];
      }
      return { x: x / total, y: y / total, z: z / total };
    }),
  );
}

function speedSeries(poses: Poses, times: readonly number[], point: number): number[] {
  return poses.map((_, i) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(poses.length - 1, i + 1);
    const dt = at(times, b) - at(times, a);
    return dt > 0 ? norm(sub(at(at(poses, b), point), at(at(poses, a), point))) / dt : 0;
  });
}

function argBest(indices: readonly number[], score: (i: number) => number, max: boolean): number {
  return indices.reduce((best, i) =>
    (max ? score(i) > score(best) : score(i) < score(best)) ? i : best,
  );
}

/** Signed angle (degrees) between hip line and shoulder line, seen from above. */
function separation(pose: readonly Point3[]): number {
  const hips = sub(at(pose, 24), at(pose, 23));
  const shoulders = sub(at(pose, 12), at(pose, 11));
  const raw = Math.atan2(shoulders.z, shoulders.x) - Math.atan2(hips.z, hips.x);
  return Math.atan2(Math.sin(raw), Math.cos(raw)) * DEG;
}

function checkInput(frames: readonly PoseFrame[]): void {
  frames.forEach((frame, i) => {
    if (!Number.isFinite(frame.time) || (i > 0 && frame.time <= at(frames, i - 1).time))
      throw new PoseInputError('Frame times must be finite and strictly increasing.');
    if (frame.world !== null && frame.world.length !== POSE_LANDMARK_COUNT)
      throw new PoseInputError(`Frame ${String(i)} must have 33 landmarks.`);
  });
}

/** Directions at the strike: along the kick, across it towards the standing side, and up. */
function strikeAxes(poses: Poses, k: number, foot: Foot) {
  const kick = SIDE_POINTS[foot];
  const stand = SIDE_POINTS[foot === 'left' ? 'right' : 'left'];
  const pk = at(poses, k);
  const travel = horizontal(
    sub(at(at(poses, k + 1), kick.ankle), at(at(poses, k - 1), kick.ankle)),
  );
  const forward = norm(travel) === 0 ? { x: 1, y: 0, z: 0 } : travel;
  const across = sub(at(pk, stand.hip), at(pk, kick.hip));
  const along = dot(across, forward);
  const lateral = horizontal(sub(across, { x: forward.x * along, y: 0, z: forward.z * along }));
  const side = norm(lateral) === 0 ? { x: -forward.z, y: 0, z: forward.x } : lateral;
  return { forward, side, up: { x: 0, y: -1, z: 0 }, kick, stand };
}

/** Find the strike in a clip and read the measurements around it. */
export function analyseShot(frames: readonly PoseFrame[]): ShotAnalysis {
  checkInput(frames);
  const { confidence, reasons } = assessVisibility(frames);
  if (reasons.length > 0) return { kind: 'not-seen', reasons, confidence };

  const L = POSE_LIMITS;
  const poses = smoothPoses(frames);
  const times = frames.map((frame) => frame.time);
  const all = poses.map((_, i) => i);
  const speeds = { left: speedSeries(poses, times, 27), right: speedSeries(poses, times, 28) };
  const peakOf = (side: Foot) => argBest(all, (i) => at(speeds[side], i), true);
  const foot: Foot =
    at(speeds.left, peakOf('left')) > at(speeds.right, peakOf('right')) ? 'left' : 'right';
  const k = peakOf(foot);
  const peak = at(speeds[foot], k);
  const tk = at(times, k);
  if (peak < L.minPeakSpeed) return { kind: 'no-strike', reason: 'too-slow', confidence };
  const far = all.filter((i) => Math.abs(at(times, i) - tk) > L.peakExclusion);
  const rival = Math.max(0, ...far.map((i) => Math.max(at(speeds.left, i), at(speeds.right, i))));
  if (k === 0 || k === poses.length - 1 || rival * L.peakRatio > peak)
    return { kind: 'no-strike', reason: 'no-clear-peak', confidence };

  // Top of the backswing: the kicking knee at its most bent shortly before the peak.
  const knee = (i: number) => kneeAngle(at(poses, i), foot);
  const before = all.filter((i) => i < k && tk - at(times, i) <= L.backswingWindow);
  const b = argBest(before.length > 0 ? before : [k], knee, false);
  if (b === k || knee(b) > L.maxBackswingKnee || knee(k) - knee(b) < L.minKneeExtension)
    return { kind: 'no-strike', reason: 'no-backswing', confidence };

  const { forward, side, up, kick, stand } = strikeAxes(poses, k, foot);
  const pk = at(poses, k);
  const trunk = sub(mix(at(pk, 11), at(pk, 12), 0.5), mix(at(pk, 23), at(pk, 24), 0.5));
  const plant = sub(at(pk, stand.ankle), at(pk, kick.ankle));
  const turn = (i: number) => Math.abs(separation(at(poses, i)));
  const s = argBest(all.slice(b, k + 1), turn, true);
  const height = (i: number) => at(at(poses, i), kick.hip).y - at(at(poses, i), kick.ankle).y;
  const after = all.filter((i) => i > k && at(times, i) - tk <= L.followWindow);
  const seenAfter = at(times, times.length - 1) - tk >= L.minFollowSeen && after.length > 0;
  const f = seenAfter ? argBest(after, height, true) : null;
  const lean = (axis: Point3) => Math.atan2(dot(trunk, axis), dot(trunk, up)) * DEG;

  type Row = [MeasurementId, number, Measurement['unit'], number[], boolean?];
  const rows: Row[] = [
    ['kneeAtBackswing', knee(b), 'deg', [b]],
    ['kneeAtStrike', knee(k), 'deg', [k]],
    ['hipShoulderSeparation', turn(s), 'deg', [s], true],
    ['trunkLeanForward', lean(forward), 'deg', [k]],
    ['trunkLeanSideways', lean(side), 'deg', [k], true],
    ['plantFrontBack', dot(plant, forward), 'm', [k]],
    ['plantSideways', dot(plant, side), 'm', [k], true],
    ['peakFootSpeed', peak, 'm/s', [k]],
    ['swingDuration', tk - at(times, b), 's', [b, k]],
  ];
  if (f !== null) rows.push(['followThroughHeight', height(f), 'm', [f]]);
  const measurements = rows.map(([id, value, unit, used, depth = false]) => {
    return { id, value, unit, frames: used, reliesOnDepth: depth };
  });
  const found = { strikeFrame: k, backswingFrame: b, followThroughFrame: f, confidence };
  return { kind: 'strike', foot, ...found, measurements, footSpeed: speeds[foot] };
}
