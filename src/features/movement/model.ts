import {
  frameAt,
  playerPath,
  spaceControl,
  teamShape,
  type PathPoint,
  type TeamShape,
  type Tracking,
  type TrackingFrame,
} from '../../engine/tracking';
import type { EvidenceEvent, Side } from '../../engine/types';

/** The match clock runs on from 45:00 in the second half, as on a scoreboard. */
export const HALF_SECONDS = 45 * 60;
export const PLAYBACK_SPEEDS = ['1', '2', '4'] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const STEP_SECONDS = 5;
export const TRAIL_SECONDS = 10;
/** Speed is read over the last second only: the replay never looks ahead of the moment shown. */
export const SPEED_WINDOW_SECONDS = 1;
/**
 * Faster than any sprinter: a step above this is a tracking glitch (the data card counts
 * 239 such steps in the raw file), so it is left out of distance and speed.
 */
export const MAX_PLAUSIBLE_SPEED = 12;
/** A jump to a chance lands this long before the shot, so the build-up is on screen. */
export const CHANCE_LEAD_SECONDS = 6;
/** Below this difference in share of the pitch, neither side is said to control more space. */
export const LEVEL_MARGIN = 0.02;
export const SPACE_COLS = 32;
export const SPACE_ROWS = 21;

type Point = { readonly x: number; readonly y: number };

export function periodDuration(tracking: Tracking, period: number): number {
  return tracking.meta.periods[period - 1]?.durationSeconds ?? 0;
}

/** Any requested time folded into what was recorded (`frameAt` throws outside it). */
export function clampSeconds(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(seconds, duration);
}

/** Move the replay clock on by one animation frame of wall time. */
export function advance(
  seconds: number,
  wallMs: number,
  speed: number,
  duration: number,
): { seconds: number; ended: boolean } {
  const next = seconds + (Math.max(0, wallMs) / 1000) * speed;
  return next >= duration ? { seconds: duration, ended: true } : { seconds: next, ended: false };
}

/** "47:05": whole seconds, second half counted on from 45:00. */
export function matchClock(period: number, seconds: number): string {
  const total = Math.floor(Math.max(0, seconds)) + (period >= 2 ? HALF_SECONDS : 0);
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export interface ShotMark {
  readonly id: string;
  readonly seconds: number;
  readonly side: Side;
  /** Provider xG as a decimal (the events carry it in 1/10,000 units). */
  readonly xg: number;
  /** Where on the scrubber, 0 to 1. */
  readonly position: number;
}

/** The shots of one period that fall inside its recorded tracking, in time order. */
export function shotMarks(
  events: readonly EvidenceEvent[],
  period: number,
  duration: number,
): ShotMark[] {
  return events
    .filter((e) => e.period === period && e.t >= 0 && e.t <= duration)
    .sort((a, b) => a.t - b.t)
    .map((e) => ({
      id: e.id,
      seconds: e.t,
      side: e.side,
      xg: e.weight / 10_000,
      position: duration > 0 ? e.t / duration : 0,
    }));
}

export function chanceStart(mark: ShotMark): number {
  return Math.max(0, mark.seconds - CHANCE_LEAD_SECONDS);
}

/** The next (or previous) chance whose build-up starts clearly after (or before) `seconds`. */
export function adjacentChance(
  marks: readonly ShotMark[],
  seconds: number,
  direction: 1 | -1,
): ShotMark | null {
  if (direction === 1) return marks.find((m) => chanceStart(m) > seconds + 0.5) ?? null;
  return [...marks].reverse().find((m) => chanceStart(m) < seconds - 0.5) ?? null;
}

export type Leader = Side | 'level';

export function spaceLeader(homeShare: number, margin = LEVEL_MARGIN): Leader {
  if (homeShare > 0.5 + margin / 2) return 'home';
  if (homeShare < 0.5 - margin / 2) return 'away';
  return 'level';
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex hull, counter-clockwise, without collinear points (Andrew's monotone chain). */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (sorted.length < 3) return sorted;
  const half = (list: readonly Point[]): Point[] => {
    const out: Point[] = [];
    for (const point of list) {
      for (;;) {
        const [a, b] = [out[out.length - 2], out[out.length - 1]];
        if (a === undefined || b === undefined || cross(a, b, point) > 0) break;
        out.pop();
      }
      out.push(point);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** The outfield players of a side (the goalkeeper found by the engine left out), as drawn for the shape layer. */
export function outfield(frame: TrackingFrame, side: Side): Point[] {
  return frame.players.filter((p) => p.side === side && p.slot !== frame.keepers[side]);
}

/** Cumulative metres along a path, one entry per point; implausible steps and gaps add nothing. */
export interface DistanceTable {
  readonly times: Float64Array;
  readonly metres: Float64Array;
}

export function cumulativeDistance(path: readonly PathPoint[]): DistanceTable {
  const times = new Float64Array(path.length);
  const metres = new Float64Array(path.length);
  let total = 0;
  path.forEach((point, i) => {
    const before = path[i - 1];
    if (before !== undefined && point.connected) {
      const step = Math.hypot(point.x - before.x, point.y - before.y);
      const dt = point.seconds - before.seconds;
      if (dt > 0 && step / dt <= MAX_PLAUSIBLE_SPEED) total += step;
    }
    times[i] = point.seconds;
    metres[i] = total;
  });
  return { times, metres };
}

/** Distance covered from the start of the period up to `seconds` (interpolated within a step). */
export function distanceAt(table: DistanceTable, seconds: number): number {
  const { times, metres } = table;
  if (times.length === 0 || seconds <= (times[0] ?? 0)) return 0;
  let low = 0;
  let high = times.length - 1;
  if (seconds >= (times[high] ?? 0)) return metres[high] ?? 0;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((times[mid] ?? 0) <= seconds) low = mid;
    else high = mid;
  }
  const [t0, t1] = [times[low] ?? 0, times[high] ?? 0];
  const [m0, m1] = [metres[low] ?? 0, metres[high] ?? 0];
  return m0 + ((m1 - m0) * (seconds - t0)) / (t1 - t0);
}

/** Every recorded step of one player in one period, summed once and then read at any time. */
export function distanceTable(tracking: Tracking, slot: number, period: number): DistanceTable {
  return cumulativeDistance(
    playerPath(tracking, slot, period, 0, periodDuration(tracking, period)),
  );
}

/**
 * Average speed over the last second, in m/s. Null when the player was off the pitch at any
 * point of that second, when less than a quarter second has been played, or for a glitch.
 */
export function currentSpeed(
  tracking: Tracking,
  slot: number,
  period: number,
  seconds: number,
): number | null {
  const from = Math.max(0, seconds - SPEED_WINDOW_SECONDS);
  if (seconds - from < 0.25) return null;
  const path = playerPath(tracking, slot, period, from, seconds);
  const first = path[0];
  if (first === undefined || first.seconds !== from || path.some((p, i) => i > 0 && !p.connected)) {
    return null;
  }
  const last = path[path.length - 1] ?? first;
  if (last.seconds !== seconds) return null;
  const metres = path.reduce((sum, p, i) => {
    const before = path[i - 1];
    return before === undefined ? sum : sum + Math.hypot(p.x - before.x, p.y - before.y);
  }, 0);
  const speed = metres / (seconds - from);
  return speed <= MAX_PLAUSIBLE_SPEED ? speed : null;
}

export interface PlayerReadout {
  readonly slot: number;
  readonly side: Side;
  readonly shirt: number;
  readonly onPitch: boolean;
  readonly speed: number | null;
  readonly metres: number;
}

export interface Readout {
  readonly frame: TrackingFrame;
  readonly clock: string;
  readonly home: TeamShape | null;
  readonly away: TeamShape | null;
  /** Null only when nobody is on the pitch. */
  readonly homeShare: number | null;
  readonly owners: Uint8Array | null;
  readonly leader: Leader | null;
  readonly player: PlayerReadout | null;
}

/** Everything the readout panel, the live line and the flat pitch show for one moment. */
export function readReplay(
  tracking: Tracking,
  period: number,
  seconds: number,
  slot: number | null,
  distances: DistanceTable | null,
): Readout {
  const at = clampSeconds(seconds, periodDuration(tracking, period));
  const frame = frameAt(tracking, period, at);
  const space = frame.players.length > 0 ? spaceControl(frame, SPACE_COLS, SPACE_ROWS) : null;
  const entry = slot === null ? undefined : tracking.meta.roster[slot];
  const player: PlayerReadout | null =
    entry === undefined
      ? null
      : {
          slot: entry.slot,
          side: entry.side,
          shirt: entry.shirt,
          onPitch: frame.players.some((p) => p.slot === entry.slot),
          speed: currentSpeed(tracking, entry.slot, period, at),
          metres: distances === null ? 0 : distanceAt(distances, at),
        };
  return {
    frame,
    clock: matchClock(period, at),
    home: teamShape(frame, 'home'),
    away: teamShape(frame, 'away'),
    homeShare: space?.homeShare ?? null,
    owners: space?.owners ?? null,
    leader: space === null ? null : spaceLeader(space.homeShare),
    player,
  };
}
