import type { Tracking } from '../../engine/tracking';

/**
 * Per-animation-frame sampling straight from the decoded samples, written into buffers that
 * are allocated once, so a 60 fps loop creates no garbage. Layout as documented in
 * `src/engine/tracking.ts`. At sample times it returns exactly what `frameAt` returns.
 */
export interface Positions {
  /** x, y in metres for every roster slot, then the ball. */
  readonly xy: Float32Array;
  /** 1 where the slot (or, last, the ball) is on the pitch at this instant. */
  readonly present: Uint8Array;
}

export function createPositions(tracking: Tracking): Positions {
  const count = tracking.meta.roster.length + 1;
  return { xy: new Float32Array(count * 2), present: new Uint8Array(count) };
}

/**
 * Players move along a Catmull-Rom curve through the 4 Hz samples, so motion has no corner
 * at each sample; the ball, which changes direction sharply at a kick, moves in straight
 * lines. Nothing is drawn across an absence: both neighbouring samples must exist.
 */
export function samplePositions(
  tracking: Tracking,
  period: number,
  seconds: number,
  out: Positions,
): void {
  const { meta, data } = tracking;
  const info = meta.periods[period - 1];
  out.present.fill(0);
  if (info === undefined) return;
  const last = info.frameCount - 1;
  const position = Math.min(Math.max(0, seconds * meta.sampleRateHz), last);
  const f1 = Math.floor(position);
  const t = position - f1;
  const f2 = Math.min(last, f1 + 1);
  const base = (frame: number) => (info.startFrame + frame) * meta.columns * 2;
  const rows = [base(Math.max(0, f1 - 1)), base(f1), base(f2), base(Math.min(last, f1 + 2))];
  const [r0 = 0, r1 = 0, r2 = 0, r3 = 0] = rows;
  for (let column = 0; column < meta.columns; column += 1) {
    const c = column * 2;
    const x1 = data[r1 + c] ?? meta.sentinel;
    const x2 = data[r2 + c] ?? meta.sentinel;
    if (x1 === meta.sentinel || (t > 0 && x2 === meta.sentinel)) continue;
    const y1 = data[r1 + c + 1] ?? 0;
    const y2 = data[r2 + c + 1] ?? 0;
    let x = x1;
    let y = y1;
    if (t > 0) {
      const raw0 = data[r0 + c] ?? meta.sentinel;
      const raw3 = data[r3 + c] ?? meta.sentinel;
      const smooth = column !== meta.ballColumn;
      // A missing outer neighbour is replaced by the inner one: the curve then eases in or out.
      const x0 = smooth && raw0 !== meta.sentinel ? raw0 : x1;
      const y0 = smooth && raw0 !== meta.sentinel ? (data[r0 + c + 1] ?? y1) : y1;
      const x3 = smooth && raw3 !== meta.sentinel ? raw3 : x2;
      const y3 = smooth && raw3 !== meta.sentinel ? (data[r3 + c + 1] ?? y2) : y2;
      x = smooth ? catmullRom(x0, x1, x2, x3, t) : x1 + (x2 - x1) * t;
      y = smooth ? catmullRom(y0, y1, y2, y3, t) : y1 + (y2 - y1) * t;
    }
    out.xy[column * 2] = x / 100;
    out.xy[column * 2 + 1] = y / 100;
    out.present[column] = 1;
  }
}

/** Uniform Catmull-Rom between p1 (t = 0) and p2 (t = 1). */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (3 * p1 - p0 - 3 * p2 + p3) * t3)
  );
}

/** Room for a trail of `seconds` at the file's sample rate, plus its two interpolated ends. */
export function trailCapacity(tracking: Tracking, seconds: number): number {
  return Math.ceil(seconds * tracking.meta.sampleRateHz) + 2;
}

/**
 * The last `window` seconds of one player's path, ending at the current (smoothed) position,
 * written as x, y pairs into `out`. Only the latest unbroken run is kept: a trail never
 * bridges a time off the pitch. Returns the number of points written.
 */
export function trailInto(
  tracking: Tracking,
  slot: number,
  period: number,
  seconds: number,
  window: number,
  current: Positions,
  out: Float32Array,
): number {
  const { meta, data } = tracking;
  const info = meta.periods[period - 1];
  if (info === undefined || current.present[slot] !== 1) return 0;
  const rate = meta.sampleRateHz;
  const first = Math.max(0, Math.ceil((seconds - window) * rate));
  const lastSample = Math.min(info.frameCount - 1, Math.floor(seconds * rate));
  const capacity = Math.floor(out.length / 2);
  let count = 0;
  for (let frame = first; frame <= lastSample; frame += 1) {
    const at = ((info.startFrame + frame) * meta.columns + slot) * 2;
    const x = data[at] ?? meta.sentinel;
    if (x === meta.sentinel) {
      count = 0;
      continue;
    }
    if (count >= capacity - 1) break;
    out[count * 2] = x / 100;
    out[count * 2 + 1] = (data[at + 1] ?? 0) / 100;
    count += 1;
  }
  out[count * 2] = current.xy[slot * 2] ?? 0;
  out[count * 2 + 1] = current.xy[slot * 2 + 1] ?? 0;
  return count + 1;
}

/** Which way each roster slot faces and how fast it moves, in buffers allocated once. */
export interface Headings {
  /** Radians in pitch axes: 0 looks along +x, a quarter turn looks along +y. */
  readonly angle: Float32Array;
  /** Metres a second over the look-back window; 0 when it cannot be known. */
  readonly speed: Float32Array;
}

export function createHeadings(tracking: Tracking): Headings {
  const count = tracking.meta.roster.length;
  return { angle: new Float32Array(count), speed: new Float32Array(count) };
}

/** Below this a player is standing or drifting: they keep facing the way they last ran. */
export const TURN_SPEED = 0.6;
/** As in model.ts: faster than any sprinter is a tracking glitch, not a movement. */
const GLITCH_SPEED = 12;

/**
 * Turn every player towards the way they are moving. `before` is where they were `dt`
 * seconds earlier. A player who is standing, was off the pitch at either moment, or "moved"
 * faster than anyone can run keeps their old facing. `ease` is the share of the turn made
 * now (1 snaps), always the short way round.
 */
export function headingsInto(
  now: Positions,
  before: Positions,
  dt: number,
  ease: number,
  out: Headings,
): void {
  for (let slot = 0; slot < out.angle.length; slot += 1) {
    out.speed[slot] = 0;
    if (dt <= 0 || now.present[slot] !== 1 || before.present[slot] !== 1) continue;
    const dx = (now.xy[slot * 2] ?? 0) - (before.xy[slot * 2] ?? 0);
    const dy = (now.xy[slot * 2 + 1] ?? 0) - (before.xy[slot * 2 + 1] ?? 0);
    const speed = Math.hypot(dx, dy) / dt;
    if (speed > GLITCH_SPEED) continue;
    out.speed[slot] = speed;
    if (speed < TURN_SPEED) continue;
    const from = out.angle[slot] ?? 0;
    const turn = Math.atan2(dy, dx) - from;
    out.angle[slot] = from + Math.atan2(Math.sin(turn), Math.cos(turn)) * ease;
  }
}
