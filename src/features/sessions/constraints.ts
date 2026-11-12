import {
  EQUIPMENT,
  FOCUS_KEYS,
  PITCH_AREAS,
  type Equipment,
  type FocusKey,
  type PitchArea,
} from '../../data/drills';
import type { SessionConstraints } from '../../engine';
import type { Enums } from '../../lib/supabase';

/** The planner offers 4-30 players: below 4 no drill in the library works, above 30 a coach needs two groups. */
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 30;
export const DURATIONS = [45, 60, 75, 90] as const;
export type Duration = (typeof DURATIONS)[number];
// Small goals are on by default: without any goal, finishing and build-up drills cannot be planned.
export const DEFAULT_EQUIPMENT: readonly Equipment[] = ['balls', 'cones', 'bibs', 'small_goals'];
export const ROTATION_ROUNDS = 6;

export interface PlannerForm {
  readonly focus: FocusKey;
  /** Calendar date as `YYYY-MM-DD`, the format the `date` column and the date input share. */
  readonly heldOn: string;
  readonly players: number;
  readonly minutes: Duration;
  readonly area: PitchArea;
  readonly equipment: readonly Equipment[];
  readonly floodlit: boolean;
}

export type FormErrorCode =
  | 'UNKNOWN_FOCUS'
  | 'INVALID_DATE'
  | 'INVALID_PLAYERS'
  | 'INVALID_MINUTES'
  | 'UNKNOWN_AREA'
  | 'UNKNOWN_EQUIPMENT';

export type FormErrors = Partial<Record<keyof PlannerForm, FormErrorCode>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** A link can carry anything, so an unknown focus is dropped rather than trusted. */
export function parseFocus(value: string | null): FocusKey | null {
  return FOCUS_KEYS.find((key) => key === value) ?? null;
}

export function parseMatchId(value: string | null): string | null {
  return isUuid(value) ? value : null;
}

/** Today in the coach's own time zone: `toISOString` would give yesterday after midnight in Sarajevo. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A real calendar date: `2026-02-31` has the right shape and is still wrong. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The squad size, kept inside what the stepper allows. */
export function defaultPlayers(squadSize: number): number {
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, squadSize));
}

export function initialForm(options: {
  readonly focus: string | null;
  readonly squadSize: number;
  readonly now?: Date;
}): PlannerForm {
  return {
    focus: parseFocus(options.focus) ?? FOCUS_KEYS[0],
    heldOn: todayIso(options.now),
    players: defaultPlayers(options.squadSize),
    minutes: 60,
    area: 'half',
    equipment: DEFAULT_EQUIPMENT,
    floodlit: false,
  };
}

export function validateForm(form: PlannerForm): FormErrors {
  const errors: { -readonly [K in keyof FormErrors]: FormErrors[K] } = {};
  if (!FOCUS_KEYS.includes(form.focus)) errors.focus = 'UNKNOWN_FOCUS';
  if (!isIsoDate(form.heldOn)) errors.heldOn = 'INVALID_DATE';
  if (!Number.isInteger(form.players) || form.players < MIN_PLAYERS || form.players > MAX_PLAYERS) {
    errors.players = 'INVALID_PLAYERS';
  }
  if (!DURATIONS.includes(form.minutes)) errors.minutes = 'INVALID_MINUTES';
  if (!PITCH_AREAS.includes(form.area)) errors.area = 'UNKNOWN_AREA';
  if (!form.equipment.every((item) => EQUIPMENT.includes(item)))
    errors.equipment = 'UNKNOWN_EQUIPMENT';
  return errors;
}

export function toConstraints(form: PlannerForm, ageGroup: Enums['age_group']): SessionConstraints {
  return {
    focus: form.focus,
    players: form.players,
    minutes: form.minutes,
    area: form.area,
    ageGroup,
    equipment: form.equipment,
  };
}

/** Turnouts to plan for: the expected number, two fewer and four fewer, never below one. */
export function attendanceCounts(players: number): number[] {
  return [players, players - 2, players - 4].filter((count) => count >= 1);
}

/** A third of the group works the practised role at once, and never fewer than two. */
export function rotationSlots(players: number): number {
  return Math.max(2, Math.floor(players / 3));
}

/** Toggle one item, keeping the library's own order so equal choices compare equal. */
export function toggleEquipment(current: readonly Equipment[], item: Equipment): Equipment[] {
  const next = current.includes(item)
    ? current.filter((entry) => entry !== item)
    : [...current, item];
  return EQUIPMENT.filter((entry) => next.includes(entry));
}
