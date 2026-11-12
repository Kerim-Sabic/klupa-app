import { EngineError, type Side } from './types';

/**
 * Player and ball tracking for one match, as shipped in `public/data/tracking/`.
 *
 * Binary layout (little-endian Int16, centimetres from the pitch centre, x along the
 * length, y across): the frames of every period are stored one after another with no
 * header. One frame is `columns` pairs `x, y`; column `c < roster.length` is
 * `roster[c]`, the last column is the ball. Frame `f` of a period starts at Int16
 * index `(startFrame + f) * columns * 2`. A missing object holds `sentinel` in both
 * values. Period time zero is the event-clock kick-off of the half.
 */
export const TRACKING_FORMAT_VERSION = 1;

type Sign = 1 | -1;
type Metres = { readonly x: number; readonly y: number };

export type TrackingRosterEntry = Readonly<{ slot: number; side: Side; shirt: number }>;

export type TrackingPeriodMeta = Readonly<{
  period: number;
  startFrame: number;
  frameCount: number;
  durationSeconds: number;
}>;

export interface TrackingMeta {
  readonly formatVersion: number;
  readonly pitch: { readonly lengthMetres: number; readonly widthMetres: number };
  readonly sampleRateHz: number;
  readonly sentinel: number;
  readonly columns: number;
  readonly ballColumn: number;
  readonly roster: readonly TrackingRosterEntry[];
  readonly periods: readonly TrackingPeriodMeta[];
  readonly bytes: number;
}

export interface Tracking {
  readonly meta: TrackingMeta;
  /** Decoded Int16 values, see the layout above. */
  readonly data: Int16Array;
  /** Per period (index = period - 1): the roster slot of each side's goalkeeper. */
  readonly keepers: readonly Readonly<Record<Side, number>>[];
  /** Per period: +1 when the side attacks towards +x. */
  readonly attack: readonly Readonly<Record<Side, Sign>>[];
}

export type PlayerPoint = Metres & TrackingRosterEntry;

export interface TrackingFrame {
  readonly period: number;
  readonly seconds: number;
  /** Players on the pitch at this instant, in roster-slot order. */
  readonly players: readonly PlayerPoint[];
  readonly ball: Metres | null;
  readonly keepers: Readonly<Record<Side, number>>;
  readonly attack: Readonly<Record<Side, Sign>>;
  readonly lengthMetres: number;
  readonly widthMetres: number;
}

function fail(message: string): never {
  throw new EngineError('INVALID_EVENT', `Tracking: ${message}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isPositive = (v: unknown): v is number => typeof v === 'number' && v > 0 && v < Infinity;

const INT_FIELDS = ['formatVersion', 'sampleRateHz', 'sentinel', 'columns', 'ballColumn', 'bytes'];

/** Shape check for metadata that came from JSON. `parseTrackingMeta` adds consistency checks. */
export function isTrackingMeta(value: unknown): value is TrackingMeta {
  if (!isRecord(value) || !isRecord(value.pitch)) return false;
  const { roster, periods } = value;
  return (
    INT_FIELDS.every((key) => isInt(value[key])) &&
    isPositive(value.pitch.lengthMetres) &&
    isPositive(value.pitch.widthMetres) &&
    Array.isArray(roster) &&
    roster.every(
      (e) =>
        isRecord(e) && isInt(e.slot) && isInt(e.shirt) && (e.side === 'home' || e.side === 'away'),
    ) &&
    Array.isArray(periods) &&
    periods.every(
      (p) =>
        isRecord(p) &&
        [p.period, p.startFrame, p.frameCount].every(isInt) &&
        isPositive(p.durationSeconds),
    )
  );
}

function assertConsistent(meta: TrackingMeta): void {
  if (meta.formatVersion !== TRACKING_FORMAT_VERSION) {
    fail(`format version ${String(meta.formatVersion)} is not supported.`);
  }
  const slots = meta.roster.length;
  if (
    meta.columns !== slots + 1 ||
    meta.ballColumn !== slots ||
    meta.roster.some((e, i) => e.slot !== i)
  ) {
    fail('roster slots must run 0, 1, 2, ... and the ball must be the last column.');
  }
  let frames = 0;
  for (const [index, period] of meta.periods.entries()) {
    const seconds = (period.frameCount - 1) / meta.sampleRateHz;
    if (
      period.period !== index + 1 ||
      period.startFrame !== frames ||
      period.frameCount < 1 ||
      Math.abs(seconds - period.durationSeconds) > 1e-6
    ) {
      fail('periods must be numbered from 1, stored back to back, with matching durations.');
    }
    frames += period.frameCount;
  }
  if (meta.periods.length === 0 || meta.bytes !== frames * meta.columns * 4) {
    fail('byte size does not match the frame count and column count.');
  }
}

/** Validate untrusted JSON (for example `fetch().json()`) into `TrackingMeta`. */
export function parseTrackingMeta(value: unknown): TrackingMeta {
  if (!isTrackingMeta(value)) return fail('metadata has the wrong shape.');
  assertConsistent(value);
  return value;
}

/** Linear interpolation between two samples; an object missing at either end is absent. */
function rawFrameAt(
  data: Int16Array,
  meta: TrackingMeta,
  period: number,
  seconds: number,
): Pick<TrackingFrame, 'players' | 'ball'> {
  const info = meta.periods[period - 1];
  const position = seconds * meta.sampleRateHz;
  if (info === undefined || !(position >= 0 && position <= info.frameCount - 1)) {
    throw new EngineError('INVALID_GRID', `Time ${String(seconds)} s is not recorded.`);
  }
  const { sentinel } = meta;
  const low = Math.floor(position);
  const fraction = position - low;
  const read = (frame: number, column: number): Metres | null => {
    const at = ((info.startFrame + frame) * meta.columns + column) * 2;
    const x = data[at];
    const y = data[at + 1];
    return x === undefined || y === undefined || x === sentinel ? null : { x: x / 100, y: y / 100 };
  };
  const point = (column: number): Metres | null => {
    const a = read(low, column);
    if (a === null || fraction === 0) return a;
    const b = read(low + 1, column);
    return b === null ? null : { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
  };
  const players: PlayerPoint[] = [];
  for (const entry of meta.roster) {
    const found = point(entry.slot);
    if (found !== null) players.push({ ...entry, ...found });
  }
  return { players, ball: point(meta.ballColumn) };
}

/**
 * Which end each side defends, and who keeps goal, from the first frame of a period.
 * The side whose centroid is further from the centre line decides (the team not taking
 * the kick-off stands in its own half); the other side defends the opposite end. A side's
 * goalkeeper is its player nearest its own goal line. Limit: assumes the goalkeeper is on
 * the pitch at the first frame and has not left his half.
 */
function readSides(players: readonly PlayerPoint[]): {
  keepers: Record<Side, number>;
  attack: Record<Side, Sign>;
} {
  const centroid = (side: Side): number => {
    const xs = players.filter((player) => player.side === side).map((player) => player.x);
    return xs.length === 0 ? fail(`no ${side} player on the pitch at kick-off.`) : mean(xs);
  };
  const [home, away] = [centroid('home'), centroid('away')];
  const decider: Side = Math.abs(home) >= Math.abs(away) ? 'home' : 'away';
  const own: Sign = (decider === 'home' ? home : away) < 0 ? -1 : 1;
  const ownGoal: Record<Side, Sign> =
    decider === 'home' ? { home: own, away: flip(own) } : { home: flip(own), away: own };
  const keeper = (side: Side): number =>
    players
      .filter((player) => player.side === side)
      .reduce((a, b) => (ownGoal[side] * b.x > ownGoal[side] * a.x ? b : a)).slot;
  return {
    keepers: { home: keeper('home'), away: keeper('away') },
    attack: { home: flip(ownGoal.home), away: flip(ownGoal.away) },
  };
}

const flip = (sign: Sign): Sign => (sign === 1 ? -1 : 1);

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Decode the shipped binary. Throws `EngineError('INVALID_EVENT')` on any size or version mismatch. */
export function decodeTracking(buffer: ArrayBuffer, meta: TrackingMeta): Tracking {
  assertConsistent(meta);
  if (buffer.byteLength !== meta.bytes) {
    fail(`expected ${String(meta.bytes)} bytes, received ${String(buffer.byteLength)}.`);
  }
  const view = new DataView(buffer);
  const data = Int16Array.from({ length: meta.bytes / 2 }, (_, i) => view.getInt16(i * 2, true));
  const sides = meta.periods.map((p) => readSides(rawFrameAt(data, meta, p.period, 0).players));
  return { meta, data, keepers: sides.map((s) => s.keepers), attack: sides.map((s) => s.attack) };
}

/** Everything on the pitch at `seconds` into `period`. Throws `INVALID_GRID` outside the recorded range. */
export function frameAt(tracking: Tracking, period: number, seconds: number): TrackingFrame {
  const { meta } = tracking;
  const raw = rawFrameAt(tracking.data, meta, period, seconds);
  const keepers = tracking.keepers[period - 1] ?? fail('missing period data.');
  const attack = tracking.attack[period - 1] ?? fail('missing period data.');
  const { lengthMetres, widthMetres } = meta.pitch;
  return { period, seconds, ...raw, keepers, attack, lengthMetres, widthMetres };
}

/**
 * `count`: outfield players of the side on the pitch. `width`: extent across the pitch
 * (max y - min y). `length`: extent along it (max x - min x). `area`: convex hull area in
 * square metres (0 for fewer than three players).
 */
export type TeamShape = Readonly<{
  count: number;
  centroidX: number;
  centroidY: number;
  width: number;
  length: number;
  area: number;
}>;

function cross(o: Metres, a: Metres, b: Metres): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Half of Andrew's monotone chain: keeps strictly counter-clockwise turns. */
function chain(points: readonly Metres[]): Metres[] {
  const out: Metres[] = [];
  for (const point of points) {
    for (;;) {
      const [a, b] = [out[out.length - 2], out[out.length - 1]];
      if (a === undefined || b === undefined || cross(a, b, point) > 0) break;
      out.pop();
    }
    out.push(point);
  }
  return out;
}

function hullArea(points: readonly Metres[]): number {
  if (points.length < 3) return 0;
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  const hull = [...chain(sorted).slice(0, -1), ...chain([...sorted].reverse()).slice(0, -1)];
  const twice = hull.reduce((sum, p, i) => {
    const q = hull[(i + 1) % hull.length] ?? p;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  return Math.abs(twice) / 2;
}

/**
 * Shape of a side's outfield players (everyone on the pitch except the goalkeeper
 * identified at the first frame of the period). Null when no outfield player is on.
 */
export function teamShape(frame: TrackingFrame, side: Side): TeamShape | null {
  const points = frame.players.filter((p) => p.side === side && p.slot !== frame.keepers[side]);
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    count: points.length,
    centroidX: mean(xs),
    centroidY: mean(ys),
    width: Math.max(...ys) - Math.min(...ys),
    length: Math.max(...xs) - Math.min(...xs),
    area: hullArea(points),
  };
}

/** `owners` is row-major (`row * cols + col`, row 0 at the lowest y): 1 where the nearest player is home. */
export type SpaceControl = Readonly<{
  cols: number;
  rows: number;
  homeCells: number;
  awayCells: number;
  homeShare: number;
  owners: Uint8Array;
}>;

/**
 * "Space control (nearest player)": every cell of a cols x rows grid belongs to the side of
 * the nearest player on the pitch (goalkeepers included; ties go to the lower roster
 * slot). This is a nearest-neighbour count, not a pitch control model.
 */
export function spaceControl(frame: TrackingFrame, cols = 32, rows = 21): SpaceControl {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new EngineError(
      'INVALID_GRID',
      'Grid needs a whole number of columns and rows, 1 or more.',
    );
  }
  if (frame.players.length === 0) fail('no players on the pitch.');
  const owners = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    const cy = -frame.widthMetres / 2 + (row + 0.5) * (frame.widthMetres / rows);
    for (let col = 0; col < cols; col += 1) {
      const cx = -frame.lengthMetres / 2 + (col + 0.5) * (frame.lengthMetres / cols);
      let best = Infinity;
      for (const p of frame.players) {
        const d = (cx - p.x) * (cx - p.x) + (cy - p.y) * (cy - p.y);
        if (d < best) {
          best = d;
          owners[row * cols + col] = p.side === 'home' ? 1 : 0;
        }
      }
    }
  }
  const homeCells = owners.reduce((sum, owner) => sum + owner, 0);
  const total = cols * rows;
  return {
    cols,
    rows,
    homeCells,
    awayCells: total - homeCells,
    homeShare: homeCells / total,
    owners,
  };
}

/** `connected` is false at the first point of a run: start a new line there (the player was off before). */
export type PathPoint = Metres & Readonly<{ seconds: number; connected: boolean }>;

/**
 * Trail of one player from `fromSeconds` to `toSeconds`: the interpolated end points and
 * every sample in between while the player is on the pitch. Never bridges an absence.
 */
export function playerPath(
  tracking: Tracking,
  slot: number,
  period: number,
  fromSeconds: number,
  toSeconds: number,
): PathPoint[] {
  const { meta } = tracking;
  const known = Number.isInteger(slot) && slot >= 0 && slot < meta.roster.length;
  if (!known || !(fromSeconds <= toSeconds)) {
    throw new EngineError(
      'INVALID_GRID',
      'Path needs a roster slot and a start not after its end.',
    );
  }
  const rate = meta.sampleRateHz;
  const times = [fromSeconds];
  for (let k = Math.floor(fromSeconds * rate) + 1; k / rate < toSeconds; k += 1)
    times.push(k / rate);
  if (toSeconds > fromSeconds) times.push(toSeconds);
  const path: PathPoint[] = [];
  let previous = false;
  for (const seconds of times) {
    const found = rawFrameAt(tracking.data, meta, period, seconds).players.find(
      (p) => p.slot === slot,
    );
    if (found !== undefined) path.push({ seconds, x: found.x, y: found.y, connected: previous });
    previous = found !== undefined;
  }
  return path;
}
