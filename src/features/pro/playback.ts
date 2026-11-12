/*
 * The "as live" transport as a pure reducer: where the playhead is, whether it runs, how fast.
 * Time only enters through `tick` with the wall-clock milliseconds since the last frame, so the
 * whole transport is testable without a browser.
 */

/** Playback speeds: 60x plays a 45-minute half in 45 seconds. */
export const SPEEDS = [1, 10, 30, 60] as const;
export type Speed = (typeof SPEEDS)[number];
export const DEFAULT_SPEED: Speed = 30;

/** Arrow keys step this far; with Shift, a minute. */
export const STEP_SECONDS = 10;
export const BIG_STEP_SECONDS = 60;

export interface PlaybackState {
  /** Seconds of play from kick-off (see `matchClock`). */
  readonly playhead: number;
  readonly playing: boolean;
  readonly speed: Speed;
  /** Seconds of play in the match. */
  readonly total: number;
}

export type PlaybackAction =
  | { readonly type: 'tick'; readonly ms: number }
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  | { readonly type: 'toggle' }
  | { readonly type: 'seek'; readonly playhead: number }
  | { readonly type: 'step'; readonly seconds: number }
  | { readonly type: 'speed'; readonly speed: Speed }
  | { readonly type: 'nextSpeed' }
  | { readonly type: 'fullMatch' }
  | { readonly type: 'watchLive'; readonly autoplay: boolean };

/** The page opens on the finished match: an analysis first, a replay on request. */
export function initialPlayback(total: number): PlaybackState {
  return { playhead: total, playing: false, speed: DEFAULT_SPEED, total };
}

const clamp = (state: PlaybackState, playhead: number): number =>
  Number.isFinite(playhead) ? Math.min(Math.max(playhead, 0), state.total) : state.playhead;

export function atFullTime(state: PlaybackState): boolean {
  return state.playhead >= state.total;
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'tick': {
      if (!state.playing) return state;
      const playhead = clamp(state, state.playhead + (Math.max(action.ms, 0) / 1000) * state.speed);
      return { ...state, playhead, playing: playhead < state.total };
    }
    case 'play':
      // Playing from full time starts again from kick-off.
      return { ...state, playing: true, playhead: atFullTime(state) ? 0 : state.playhead };
    case 'pause':
      return state.playing ? { ...state, playing: false } : state;
    case 'toggle':
      return playbackReducer(state, { type: state.playing ? 'pause' : 'play' });
    case 'seek':
      return { ...state, playhead: clamp(state, action.playhead) };
    case 'step':
      return { ...state, playhead: clamp(state, state.playhead + action.seconds) };
    case 'speed':
      return { ...state, speed: action.speed };
    case 'nextSpeed': {
      const next = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length] ?? DEFAULT_SPEED;
      return { ...state, speed: next };
    }
    case 'fullMatch':
      return { ...state, playhead: state.total, playing: false };
    case 'watchLive':
      return { ...state, playhead: 0, playing: action.autoplay };
  }
}

/** The keyboard on the scrubber: Space plays or pauses, arrows step, Home and End jump. */
export function keyAction(key: string, shift: boolean): PlaybackAction | null {
  const step = shift ? BIG_STEP_SECONDS : STEP_SECONDS;
  switch (key) {
    case ' ':
    case 'Spacebar':
      return { type: 'toggle' };
    case 'ArrowRight':
    case 'ArrowUp':
      return { type: 'step', seconds: step };
    case 'ArrowLeft':
    case 'ArrowDown':
      return { type: 'step', seconds: -step };
    case 'Home':
      return { type: 'seek', playhead: 0 };
    case 'End':
      return { type: 'fullMatch' };
    default:
      return null;
  }
}

/** Indexes (into `times`) of the moments passed when the playhead moved forward from `from` to `to`. */
export function crossed(times: readonly number[], from: number, to: number): number[] {
  if (to <= from) return [];
  return times.flatMap((time, index) => (time > from && time <= to ? [index] : []));
}

/** How often the page re-reads the match while playing: at most four times a second. */
export const PUBLISH_MS = 250;
