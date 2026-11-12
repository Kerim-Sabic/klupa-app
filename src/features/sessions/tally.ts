import type { Enums } from '../../lib/supabase';

/** The database allows 0-500 attempts per player per skill per session. */
export const MAX_ATTEMPTS = 500;
export const MAX_MINUTES = 180;

export interface Tally {
  readonly attempts: number;
  readonly successes: number;
}

export type AttendanceStatus = Enums['attendance_status'];

export interface AttendanceValue {
  readonly status: AttendanceStatus;
  readonly minutes: number | null;
  readonly rpe: number | null;
}

export const EMPTY_TALLY: Tally = { attempts: 0, successes: 0 };
export const EXPECTED: AttendanceValue = { status: 'expected', minutes: null, rpe: null };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Change attempts; if they fall below the successes, the successes come down with them. */
export function setAttempts(tally: Tally, attempts: number): Tally {
  const next = clamp(Math.round(attempts), 0, MAX_ATTEMPTS);
  return { attempts: next, successes: Math.min(tally.successes, next) };
}

/** Successes can never pass attempts: you cannot succeed at something you did not try. */
export function setSuccesses(tally: Tally, successes: number): Tally {
  return { attempts: tally.attempts, successes: clamp(Math.round(successes), 0, tally.attempts) };
}

/**
 * Marking present gives the player the whole session as minutes unless the coach already
 * set some. Marking absent clears minutes and effort: an absent player has neither, and a
 * leftover rating would feed the load figures.
 */
export function markStatus(
  value: AttendanceValue,
  status: AttendanceStatus,
  sessionMinutes: number,
): AttendanceValue {
  if (status === 'present') {
    return {
      status,
      minutes: value.minutes ?? clamp(sessionMinutes, 0, MAX_MINUTES),
      rpe: value.rpe,
    };
  }
  if (status === 'absent') return { status, minutes: null, rpe: null };
  return { ...value, status };
}

export function setMinutes(value: AttendanceValue, minutes: number): AttendanceValue {
  return { ...value, minutes: clamp(Math.round(minutes), 0, MAX_MINUTES) };
}

/** Tapping the rating that is already set clears it, so a mis-tap can be undone. */
export function toggleEffort(value: AttendanceValue, rating: number): AttendanceValue {
  return { ...value, rpe: value.rpe === rating ? null : clamp(Math.round(rating), 1, 10) };
}
