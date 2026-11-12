import { buildOpportunityReport, gini, reviewLoad, summariseResources } from '../../engine';
import {
  closedMatchMinutes,
  observationTotals,
  presentAttendance,
  squadIds,
  toExposures,
  toLoadEntries,
  toPitchSessions,
  toResourceSettings,
} from '../../features/insights/transform';
import type {
  AttendanceRecord,
  ClubFactors,
  ObservationRecord,
  StintRecord,
} from '../../features/insights/types';
import type { MatchSummary, Player, SessionSummary } from '../../lib/data';

/*
 * The arithmetic of the Today screen, as pure functions of the rows the app already reads.
 * Every number here is computed by an engine or by the insights transforms; this file only
 * decides what to show first. Nothing is invented: a measure with nothing behind it is null,
 * and a card only appears when a real count crosses a real threshold.
 */

/** Attempts below which a player counts as not yet properly observed (the engine's default). */
export const MIN_ATTEMPTS = 5;
/** The engine's prior strength, stated so the second-look list matches the Fairness screen. */
const PRIOR_STRENGTH = 10;
/** At most this many cards under "What needs you". */
export const MAX_NEEDS = 4;

export interface TodayInput {
  readonly players: readonly Player[];
  readonly matches: readonly MatchSummary[];
  readonly sessions: readonly SessionSummary[];
  readonly stints: readonly StintRecord[];
  readonly attendance: readonly AttendanceRecord[];
  readonly observations: readonly ObservationRecord[];
  readonly factors: ClubFactors;
  /** The coach's local date, 'YYYY-MM-DD'. Nothing dated later is read. */
  readonly today: string;
}

export interface RingMeasure {
  /** Share in [0, 1], or null when nothing has been recorded that it could measure. */
  readonly value: number | null;
  /** How many of `of` count towards it (players, or minutes). */
  readonly part: number;
  readonly of: number;
}

export interface TodayRings {
  /** 1 - Gini of match minutes across the squad: 1 is perfectly even. */
  readonly fair: RingMeasure;
  /** Share of the squad with at least MIN_ATTEMPTS observed attempts. */
  readonly observed: RingMeasure;
  /** Share of present training minutes that carry an effort rating. */
  readonly effort: RingMeasure;
}

/** 1 - Gini of everyone's minutes, zeros included; null when nobody has played yet. */
export function fairMinutes(minutes: readonly number[]): number | null {
  const total = minutes.reduce((sum, value) => sum + value, 0);
  if (minutes.length === 0 || total <= 0) return null;
  // Gini of a non-negative list is in [0, 1); clamp anyway so rounding can never show 101%.
  return Math.min(1, Math.max(0, 1 - gini(minutes)));
}

export function buildRings(input: TodayInput): TodayRings {
  const squad = squadIds(input.players);
  const played = closedMatchMinutes(input.stints, squad).minutes;
  const minutes = input.players.map((player) => played.get(player.id) ?? 0);
  const fair: RingMeasure = {
    value: fairMinutes(minutes),
    part: minutes.filter((value) => value > 0).length,
    of: input.players.length,
  };

  const observed = observationTotals(input.observations, squad);
  const seen = input.players.filter(
    (player) => (observed.get(player.id)?.attempts ?? 0) >= MIN_ATTEMPTS,
  ).length;
  const anyObserved = [...observed.values()].some((totals) => totals.attempts > 0);
  const observedRing: RingMeasure = {
    value: anyObserved && input.players.length > 0 ? seen / input.players.length : null,
    part: seen,
    of: input.players.length,
  };

  const present = presentAttendance(input.attendance, squad).rows.filter(
    (row) => row.sessions.held_on <= input.today,
  );
  const totalMinutes = present.reduce((sum, row) => sum + row.minutes, 0);
  const rated = present
    .filter((row) => row.rpe !== null)
    .reduce((sum, row) => sum + row.minutes, 0);
  const effort: RingMeasure = {
    value: totalMinutes > 0 ? rated / totalMinutes : null,
    part: Math.round(rated),
    of: Math.round(totalMinutes),
  };
  return { fair, observed: observedRing, effort };
}

export type Need =
  | {
      readonly kind: 'load';
      readonly players: number;
      /** The largest this-week-over-usual ratio among them. */
      readonly highestRatio: number;
    }
  | { readonly kind: 'secondLook'; readonly players: number }
  | { readonly kind: 'pitch'; readonly sessions: number; readonly hoursFreed: number };

/** Players whose training load this week rose sharply against their own recent weeks. */
export function loadNeed(input: TodayInput): Need | null {
  const squad = squadIds(input.players);
  const entries = toLoadEntries(presentAttendance(input.attendance, squad).rows).filter(
    (entry) => entry.date <= input.today,
  );
  if (entries.length === 0) return null;
  const sharp = reviewLoad(entries, { asOf: input.today }).filter(
    (row) => row.status === 'sharp_increase',
  );
  if (sharp.length === 0) return null;
  const highestRatio = Math.max(...sharp.map((row) => row.change ?? 0));
  return { kind: 'load', players: sharp.length, highestRatio };
}

/**
 * Players who have not had a fair look yet. Only once something has been observed at all:
 * before that the whole squad is "unobserved", which is true but is not news, and the
 * Observed ring already says it.
 */
export function secondLookNeed(input: TodayInput): Need | null {
  const squad = squadIds(input.players);
  const observed = observationTotals(input.observations, squad);
  if (![...observed.values()].some((totals) => totals.attempts > 0)) return null;
  const minutes = closedMatchMinutes(input.stints, squad).minutes;
  const report = buildOpportunityReport(toExposures(input.players, minutes, observed), {
    priorStrength: PRIOR_STRENGTH,
    minAttempts: MIN_ATTEMPTS,
  });
  return report.secondLook.length === 0
    ? null
    : { kind: 'secondLook', players: report.secondLook.length };
}

/** Completed sessions whose attendance would have fitted a smaller share of the pitch. */
export function pitchNeed(input: TodayInput): Need | null {
  const used = toPitchSessions(input.sessions, input.attendance);
  if (used.sessions.length === 0) return null;
  const { rightSizing } = summariseResources(used.sessions, toResourceSettings(input.factors));
  if (rightSizing.sessions.length === 0 || rightSizing.pitchHoursFreed <= 0) return null;
  return {
    kind: 'pitch',
    sessions: rightSizing.sessions.length,
    hoursFreed: rightSizing.pitchHoursFreed,
  };
}

/**
 * The cards that rest on the season's records, most important first: a child's wellbeing,
 * then fairness, then the pitch. The match focus card is added by the screen once that
 * match's events have arrived (see `matchModel.ts`), right after the load card.
 */
export function buildNeeds(input: TodayInput): Need[] {
  return [loadNeed(input), secondLookNeed(input), pitchNeed(input)].filter(
    (need): need is Need => need !== null,
  );
}

export type StepKey = 'squad' | 'match' | 'training';

export interface ChecklistStep {
  readonly key: StepKey;
  readonly done: boolean;
}

export type Stage =
  /** A demo club with no squad: the fastest way in is the sample season. */
  | { readonly kind: 'demo-empty' }
  /** A real club still setting up; `current` is the first step not yet done. */
  | {
      readonly kind: 'setup';
      readonly steps: readonly ChecklistStep[];
      readonly current: StepKey;
    }
  | { readonly kind: 'running' };

export function stageOf(input: {
  readonly players: number;
  readonly matches: number;
  readonly sessions: number;
  readonly isDemo: boolean;
}): Stage {
  if (input.isDemo && input.players === 0) return { kind: 'demo-empty' };
  const steps: ChecklistStep[] = [
    { key: 'squad', done: input.players > 0 },
    { key: 'match', done: input.matches > 0 },
    { key: 'training', done: input.sessions > 0 },
  ];
  const next = steps.find((step) => !step.done);
  return next === undefined ? { kind: 'running' } : { kind: 'setup', steps, current: next.key };
}
