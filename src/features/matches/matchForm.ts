import type { Enums } from '../../lib/supabase';

/** Usual minutes per period by age group, so most coaches never touch the field. */
export const DEFAULT_PERIOD_MINUTES: Readonly<Record<Enums['age_group'], number>> = {
  u7: 20,
  u9: 20,
  u11: 25,
  u13: 30,
  u15: 35,
  u17: 40,
  u19: 45,
  senior: 45,
};

/** The limits the database enforces, repeated here so the coach hears about them first. */
export const OPPONENT_MAX = 60;
export const PERIODS_MIN = 1;
export const PERIODS_MAX = 4;
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 60;

export interface MatchValues {
  readonly opponent: string;
  readonly playedOn: string;
  readonly periodCount: string;
  readonly periodMinutes: string;
}

export interface NewMatch {
  readonly opponent: string;
  readonly playedOn: string;
  readonly periodCount: number;
  readonly periodMinutes: number;
}

export type MatchFieldError =
  'opponentRequired' | 'opponentTooLong' | 'dateRequired' | 'periodsRange' | 'minutesRange';

export type MatchFormErrors = {
  -readonly [Field in keyof MatchValues]?: MatchFieldError | undefined;
};

export type MatchValidation =
  | { readonly ok: true; readonly value: NewMatch }
  | { readonly ok: false; readonly errors: MatchFormErrors };

/** Today's date on this device, as the yyyy-mm-dd a date input and the database expect. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

export function initialValues(ageGroup: Enums['age_group'], now: Date = new Date()): MatchValues {
  return {
    opponent: '',
    playedOn: todayIso(now),
    periodCount: '2',
    periodMinutes: String(DEFAULT_PERIOD_MINUTES[ageGroup]),
  };
}

function wholeNumberIn(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= min && value <= max ? value : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(text: string): boolean {
  if (!ISO_DATE.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

export function validateMatch(values: MatchValues): MatchValidation {
  const errors: MatchFormErrors = {};
  const opponent = values.opponent.trim();
  if (opponent === '') errors.opponent = 'opponentRequired';
  else if (opponent.length > OPPONENT_MAX) errors.opponent = 'opponentTooLong';
  if (!isRealDate(values.playedOn)) errors.playedOn = 'dateRequired';
  const periodCount = wholeNumberIn(values.periodCount, PERIODS_MIN, PERIODS_MAX);
  if (periodCount === null) errors.periodCount = 'periodsRange';
  const periodMinutes = wholeNumberIn(values.periodMinutes, MINUTES_MIN, MINUTES_MAX);
  if (periodMinutes === null) errors.periodMinutes = 'minutesRange';
  if (periodCount === null || periodMinutes === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { opponent, playedOn: values.playedOn, periodCount, periodMinutes },
  };
}
