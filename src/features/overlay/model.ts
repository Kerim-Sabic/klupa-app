import {
  canSplit,
  ringColour,
  shirtColour,
  splitTeams,
  teamOf,
  toOklab,
  type Lab,
  type Pixels,
  type Rgb,
  type Team,
  type TeamModel,
} from './teams';
import {
  EMPTY_TRACKER,
  feetOf,
  shownTracks,
  stepTracker,
  type Box,
  type Detection,
  type Point,
  type TrackerState,
} from './track';

/** Everything remembered between two analysed frames. Nothing else is kept: no picture. */
export interface OverlayState {
  readonly tracker: TrackerState;
  /** Each followed player's shirt colour, smoothed over the frames they were seen in. */
  readonly colours: ReadonlyMap<number, Lab>;
  readonly teams: TeamModel | null;
}

export const EMPTY_OVERLAY: OverlayState = {
  tracker: EMPTY_TRACKER,
  colours: new Map(),
  teams: null,
};

export interface MarkedPlayer {
  readonly id: number;
  readonly number: number;
  readonly box: Box;
  readonly feet: Point;
  readonly trail: readonly Point[];
  readonly team: Team;
}

export type TeamColours = Readonly<Record<'a' | 'b', Rgb | null>>;

/** What is drawn over one frame, and the counts beside it. */
export interface OverlayFrame {
  readonly players: readonly MarkedPlayer[];
  readonly counts: Readonly<Record<Team, number>>;
  /** The colour each team's rings are drawn in; null while the kits cannot be told apart. */
  readonly colours: TeamColours;
}

export const EMPTY_FRAME: OverlayFrame = {
  players: [],
  counts: { a: 0, b: 0, none: 0 },
  colours: { a: null, b: null },
};

/** How far a player's remembered shirt colour moves towards each new sample. */
const COLOUR_DRIFT = 0.3;

/**
 * One analysed frame from detections to what is drawn: follow the players, measure their
 * shirts in `pixels` (a small copy of the frame; null skips colour for this frame), split
 * the teams and count them. `dt` is the time since the frame before, in seconds.
 */
export function stepOverlay(
  state: OverlayState,
  detections: readonly Detection[],
  pixels: Pixels | null,
  dt: number,
): { state: OverlayState; frame: OverlayFrame } {
  const tracker = stepTracker(state.tracker, detections, dt);
  const shown = shownTracks(tracker);
  const colours = new Map<number, Lab>();
  for (const track of shown) {
    const before = state.colours.get(track.id);
    // A player hidden for a moment is not measured: the box coasts and may sit on someone else.
    const sample = pixels === null || track.missed > 0 ? null : shirtColour(pixels, track.box);
    if (sample === null) {
      if (before !== undefined) colours.set(track.id, before);
      continue;
    }
    const now = toOklab(sample);
    colours.set(
      track.id,
      before === undefined
        ? now
        : [
            before[0] + (now[0] - before[0]) * COLOUR_DRIFT,
            before[1] + (now[1] - before[1]) * COLOUR_DRIFT,
            before[2] + (now[2] - before[2]) * COLOUR_DRIFT,
          ],
    );
  }
  const teams = splitTeams([...colours.values()], state.teams);
  const counts = { a: 0, b: 0, none: 0 };
  const players = shown.map((track): MarkedPlayer => {
    const colour = colours.get(track.id);
    const team = colour === undefined ? 'none' : teamOf(colour, teams);
    counts[team] += 1;
    return {
      id: track.id,
      number: track.number,
      box: track.box,
      feet: feetOf(track.box),
      trail: track.trail,
      team,
    };
  });
  return {
    state: { tracker, colours, teams },
    frame: {
      players,
      counts,
      colours: canSplit(teams)
        ? { a: ringColour(teams.a), b: ringColour(teams.b) }
        : { a: null, b: null },
    },
  };
}

/**
 * The shortest rest between two analyses, in milliseconds: half a frame of a 60 Hz screen.
 * Short on purpose, so a device that analyses a picture in ten milliseconds still analyses
 * every picture of a camera that gives thirty a second.
 */
export const MIN_REST_MS = 8;

/**
 * When the next frame may be analysed. The model runs on the page's own thread, so while it
 * works nothing else does: no tap is answered and nothing scrolls. After each analysis the
 * page therefore rests at least as long as the analysis took. On a fast phone that changes
 * nothing (the rest is over before the next picture arrives); on a slow one it halves the
 * frames analysed and keeps every button working.
 */
export function nextAnalysisAt(finishedAt: number, tookMs: number): number {
  return finishedAt + Math.max(MIN_REST_MS, tookMs);
}

/** The moments of the last second among `times` (milliseconds), with `now` added. */
export function recentFrames(times: readonly number[], now: number, windowMs = 1000): number[] {
  return [...times.filter((time) => time > now - windowMs && time <= now), now];
}
