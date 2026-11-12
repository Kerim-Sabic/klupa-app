/**
 * Following players from one analysed frame to the next. The detector finds people afresh in
 * every frame and knows nothing of the frame before; this keeps each of them one number.
 * A small tracker of our own: boxes are matched by how much they overlap where the player
 * was heading, smoothed, and forgotten after a short absence. Pure: state in, state out.
 */

/** A box in the picture as shares of its width and height (0 to 1), origin at the top left. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Detection extends Box {
  /** The detector's confidence, 0 to 1. */
  readonly score: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Track {
  /** Counts up for ever; never given to anyone else. */
  readonly id: number;
  /** The number drawn on screen: the lowest one free when the track was confirmed, 0 before. */
  readonly number: number;
  readonly box: Box;
  /** How the middle of the box moves, in shares of the picture a second. */
  readonly vx: number;
  readonly vy: number;
  readonly hits: number;
  /** Seconds since a detection last matched. */
  readonly missed: number;
  /** Where the feet were at the latest matches, oldest first. */
  readonly trail: readonly Point[];
}

export interface TrackerState {
  readonly tracks: readonly Track[];
  readonly nextId: number;
}

export const EMPTY_TRACKER: TrackerState = { tracks: [], nextId: 1 };

export interface TrackerOptions {
  /** Overlap (intersection over union) below which two boxes are not the same player. */
  readonly minIou: number;
  /** Share of the way a box moves towards its new detection (1 follows it exactly). */
  readonly smoothing: number;
  /** Matches needed before a track gets a number: a one-frame ghost never shows. */
  readonly confirmHits: number;
  /** A numbered track is kept this long without a match, coasting on its last speed. */
  readonly maxMissedSeconds: number;
  /** A track with no number yet is given up sooner: it was probably never a player. */
  readonly maxUnsureSeconds: number;
  readonly trailPoints: number;
  /** With no overlap at all, a box may still match one this many of its own heights away. */
  readonly maxJump: number;
}

export const TRACKER_DEFAULTS: TrackerOptions = {
  minIou: 0.2,
  smoothing: 0.6,
  confirmHits: 3,
  maxMissedSeconds: 1,
  maxUnsureSeconds: 0.3,
  trailPoints: 18,
  maxJump: 0.6,
};

/** A long gap between frames (a stalled tab) must not fling boxes across the picture. */
const MAX_STEP_SECONDS = 0.5;

/** Intersection over union of two boxes: 1 for the same box, 0 for boxes that do not touch. */
export function iou(a: Box, b: Box): number {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  const shared = width * height;
  const union = a.w * a.h + b.w * b.h - shared;
  return union > 0 ? shared / union : 0;
}

/** Where a player stands: the middle of the bottom edge of their box. */
export function feetOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h };
}

function moved(box: Box, dx: number, dy: number): Box {
  return { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
}

function blend(from: Box, to: Box, k: number): Box {
  const mix = (a: number, b: number) => a + (b - a) * k;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), w: mix(from.w, to.w), h: mix(from.h, to.h) };
}

/**
 * How well a detection fits where a track was heading. Overlap wins; without enough of it, a
 * box of similar size close by still counts (a sprint at a low frame rate), but always less
 * than any real overlap. 0 means "not this player".
 */
function fit(predicted: Box, detection: Box, options: TrackerOptions): number {
  const overlap = iou(predicted, detection);
  if (overlap >= options.minIou) return 1 + overlap;
  const ratio = detection.h / predicted.h;
  if (!(ratio > 0.5 && ratio < 2)) return 0;
  const distance =
    Math.hypot(
      predicted.x + predicted.w / 2 - detection.x - detection.w / 2,
      predicted.y + predicted.h / 2 - detection.y - detection.h / 2,
    ) / predicted.h;
  return distance < options.maxJump ? 1 - distance / options.maxJump : 0;
}

function lowestFree(taken: ReadonlySet<number>): number {
  let number = 1;
  while (taken.has(number)) number += 1;
  return number;
}

/**
 * One analysed frame: match the detections to the tracks, move, start and drop tracks.
 * `dt` is the time since the frame before, in seconds. Tracks come back in order of id.
 */
export function stepTracker(
  state: TrackerState,
  detections: readonly Detection[],
  dt: number,
  options: TrackerOptions = TRACKER_DEFAULTS,
): TrackerState {
  const step = Math.min(Math.max(dt, 0), MAX_STEP_SECONDS);
  const predicted = state.tracks.map((track) => moved(track.box, track.vx * step, track.vy * step));

  const pairs: { track: number; detection: number; score: number }[] = [];
  predicted.forEach((box, track) => {
    detections.forEach((detection, index) => {
      const score = fit(box, detection, options);
      if (score > 0) pairs.push({ track, detection: index, score });
    });
  });
  // Best fit first; ties go to the older track and the earlier detection, so the result
  // never depends on the order a sort happens to keep.
  pairs.sort((a, b) => b.score - a.score || a.track - b.track || a.detection - b.detection);
  const matchOf = new Map<number, number>();
  const usedDetections = new Set<number>();
  for (const pair of pairs) {
    if (matchOf.has(pair.track) || usedDetections.has(pair.detection)) continue;
    matchOf.set(pair.track, pair.detection);
    usedDetections.add(pair.detection);
  }

  const tracks: Track[] = [];
  state.tracks.forEach((track, index) => {
    const coasting = predicted[index] ?? track.box;
    const match = matchOf.get(index);
    const detection = match === undefined ? undefined : detections[match];
    if (detection === undefined) {
      const missed = track.missed + step;
      // A player may be hidden behind another for a moment, so the track coasts, slowing
      // quickly, until it is seen again or given up.
      const patience = track.number === 0 ? options.maxUnsureSeconds : options.maxMissedSeconds;
      if (missed > patience) return;
      tracks.push({ ...track, box: coasting, vx: track.vx * 0.6, vy: track.vy * 0.6, missed });
      return;
    }
    const box = blend(coasting, detection, options.smoothing);
    const feet = feetOf(box);
    const vx = step > 0 ? (box.x + box.w / 2 - track.box.x - track.box.w / 2) / step : track.vx;
    const vy = step > 0 ? (box.y + box.h / 2 - track.box.y - track.box.h / 2) / step : track.vy;
    tracks.push({
      ...track,
      box,
      vx: track.vx + (vx - track.vx) * 0.4,
      vy: track.vy + (vy - track.vy) * 0.4,
      hits: track.hits + 1,
      missed: 0,
      trail: [...track.trail, feet].slice(-options.trailPoints),
    });
  });

  let nextId = state.nextId;
  detections.forEach((detection, index) => {
    if (usedDetections.has(index)) return;
    const box: Box = { x: detection.x, y: detection.y, w: detection.w, h: detection.h };
    tracks.push({ id: nextId, number: 0, box, vx: 0, vy: 0, hits: 1, missed: 0, trail: [] });
    nextId += 1;
  });

  const taken = new Set(tracks.map((track) => track.number).filter((number) => number > 0));
  const numbered = tracks.map((track) => {
    if (track.number > 0 || track.hits < options.confirmHits) return track;
    const number = lowestFree(taken);
    taken.add(number);
    return { ...track, number, trail: [feetOf(track.box)] };
  });
  return { tracks: numbered, nextId };
}

/** The tracks that are drawn: those that have a number (seen often enough, and recently). */
export function shownTracks(state: TrackerState): Track[] {
  return state.tracks.filter((track) => track.number > 0);
}
