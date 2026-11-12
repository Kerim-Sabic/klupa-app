import { z } from 'zod';

/**
 * The match clock as a pure reducer. Time always comes in as `now` (epoch ms) on the action,
 * so the reducer is deterministic and a reload can rebuild the exact same clock from storage.
 * `period` 0 means "before kick-off"; `ended` means the current period has been closed.
 */
export interface ClockState {
  readonly period: number;
  readonly running: boolean;
  readonly elapsedMs: number;
  readonly startedAt: number | null;
  readonly ended: boolean;
}

export type ClockAction =
  | { readonly type: 'start'; readonly now: number }
  | { readonly type: 'pause'; readonly now: number }
  | { readonly type: 'resume'; readonly now: number }
  | { readonly type: 'end'; readonly now: number }
  | { readonly type: 'next'; readonly now: number; readonly periodCount: number };

/** The database accepts clock values up to two hours (`clock_seconds between 0 and 7200`). */
export const MAX_CLOCK_SECONDS = 7200;
/** `match_events.period` and `stints.period` are 1-4. */
export const MAX_PERIODS = 4;

export const INITIAL_CLOCK: ClockState = {
  period: 0,
  running: false,
  elapsedMs: 0,
  startedAt: null,
  ended: false,
};

/** Milliseconds played in the current period. A device clock set backwards never goes negative. */
export function elapsedAt(state: ClockState, now: number): number {
  const live = state.running && state.startedAt !== null ? Math.max(0, now - state.startedAt) : 0;
  return state.elapsedMs + live;
}

/** Whole seconds into the current period, capped at what the database accepts. */
export function secondsAt(state: ClockState, now: number): number {
  return Math.min(MAX_CLOCK_SECONDS, Math.floor(elapsedAt(state, now) / 1000));
}

export function clockReducer(state: ClockState, action: ClockAction): ClockState {
  switch (action.type) {
    case 'start':
      if (state.period !== 0) return state;
      return { period: 1, running: true, elapsedMs: 0, startedAt: action.now, ended: false };
    case 'pause':
      if (!state.running) return state;
      return { ...state, running: false, elapsedMs: elapsedAt(state, action.now), startedAt: null };
    case 'resume':
      if (state.running || state.period === 0 || state.ended) return state;
      return { ...state, running: true, startedAt: action.now };
    case 'end':
      if (state.period === 0 || state.ended) return state;
      return {
        ...state,
        running: false,
        elapsedMs: elapsedAt(state, action.now),
        startedAt: null,
        ended: true,
      };
    case 'next': {
      const last = Math.min(action.periodCount, MAX_PERIODS);
      if (!state.ended || state.period >= last) return state;
      return {
        period: state.period + 1,
        running: true,
        elapsedMs: 0,
        startedAt: action.now,
        ended: false,
      };
    }
  }
}

/** Where the match stands, which decides the controls and whether events may be recorded. */
export type ClockPhase = 'before' | 'running' | 'paused' | 'break' | 'over';

export function clockPhase(state: ClockState, periodCount: number): ClockPhase {
  if (state.period === 0) return 'before';
  if (state.ended) return state.period >= Math.min(periodCount, MAX_PERIODS) ? 'over' : 'break';
  return state.running ? 'running' : 'paused';
}

/** Events can be tagged only inside a period, running or paused. */
export function canRecord(phase: ClockPhase): phase is 'running' | 'paused' {
  return phase === 'running' || phase === 'paused';
}

/** mm:ss with tabular-friendly zero padding; minutes may pass 99 in theory. */
export function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(whole / 60)).padStart(2, '0');
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

const clockSchema = z
  .object({
    period: z.number().int().min(0).max(MAX_PERIODS),
    running: z.boolean(),
    elapsedMs: z.number().min(0),
    startedAt: z.number().nullable(),
    ended: z.boolean(),
  })
  .refine((value) => value.running === (value.startedAt !== null))
  .refine((value) => !(value.running && value.ended));

export function clockKey(matchId: string): string {
  return `klupa.clock.${matchId}`;
}

/** Anything unreadable becomes a fresh clock instead of a crash at the touchline. */
export function parseClock(raw: string | null): ClockState {
  if (raw === null) return INITIAL_CLOCK;
  try {
    const parsed = clockSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : INITIAL_CLOCK;
  } catch {
    return INITIAL_CLOCK;
  }
}

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

export function loadClock(matchId: string, storage: ReadStorage = window.localStorage): ClockState {
  try {
    return parseClock(storage.getItem(clockKey(matchId)));
  } catch {
    return INITIAL_CLOCK; // Storage can be blocked (private mode); the clock still works in memory.
  }
}

/** Returns false when the browser refused to store it, so the caller can decide to warn. */
export function saveClock(
  matchId: string,
  state: ClockState,
  storage: WriteStorage = window.localStorage,
): boolean {
  try {
    storage.setItem(clockKey(matchId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
