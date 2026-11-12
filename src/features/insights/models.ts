import {
  buildOpportunityReport,
  reviewLoad,
  summariseResources,
  weekStart,
  weeklyLoad,
  type LoadStatus,
  type OpportunityRow,
  type ResourceSummary,
} from '../../engine';
import { betaInterval, type BetaInterval } from '../../engine/intervals';
import {
  MIN_PLAYERS,
  relativeAgeCheck,
  type QuarterShares,
  type RelativeAgeResult,
} from '../../engine/relativeAge';
import type { Player, SessionSummary } from '../../lib/data';
import {
  addDays,
  birthQuarterCounts,
  closedMatchMinutes,
  observationTotals,
  presentAttendance,
  squadIds,
  toExposures,
  toLoadEntries,
  toPitchSessions,
  toResourceSettings,
  trainingMinutes,
} from './transform';
import type { AttendanceRecord, ClubFactors, ObservationRecord, StintRecord } from './types';

/*
 * View models: what each screen shows, built from rows by calling the engines.
 * Nothing here re-implements an engine; it only arranges their answers.
 */

/** Pseudo-attempts the squad rate is worth. The engine's default, stated so the bar matches it. */
export const PRIOR_STRENGTH = 10;
/** Attempts below which a player counts as not yet properly observed. */
export const MIN_ATTEMPTS = 5;
/** Share of the posterior inside the drawn interval. */
export const INTERVAL_LEVEL = 0.9;

export type Evenness = 'none' | 'even' | 'somewhat' | 'uneven';

/** Gini cut-offs for plain words. With no minutes at all there is nothing to call even. */
export function evennessOf(minutesGini: number, totalMinutes: number): Evenness {
  if (totalMinutes <= 0) return 'none';
  if (minutesGini < 0.15) return 'even';
  return minutesGini < 0.3 ? 'somewhat' : 'uneven';
}

export interface AdjustedRate {
  /** The engine's shrunk rate: the mean of the posterior the interval describes. */
  readonly point: number;
  /** Null when the squad rate is exactly 0 or 1 and a Beta posterior would be degenerate. */
  readonly interval: BetaInterval | null;
}

export interface LedgerRow {
  readonly playerId: string;
  readonly shirt: number;
  readonly label: string;
  readonly matchMinutes: number;
  readonly minutesShare: number;
  /** Positive: more than an equal share of the minutes played. Negative: less. */
  readonly minutesVersusEqual: number;
  readonly trainingMinutes: number;
  readonly attempts: number;
  readonly successes: number;
  readonly sessionsObserved: number;
  readonly rawRate: number | null;
  /** Null when nothing at all has been observed in the squad. */
  readonly adjusted: AdjustedRate | null;
  readonly underObserved: boolean;
}

export type RelativeAgeSummary =
  | { readonly status: 'needs_more'; readonly known: number }
  | {
      readonly status: 'ready';
      readonly known: number;
      /** Players in the squad with no birth quarter recorded; they are not in the chart. */
      readonly unknown: number;
      readonly result: RelativeAgeResult;
      /** Share of the known players' match minutes per quarter, null with no minutes. */
      readonly minuteShares: QuarterShares | null;
    };

export interface FairShareModel {
  readonly squadSize: number;
  readonly playersWithMinutes: number;
  readonly totalMinutes: number;
  readonly minutesGini: number;
  readonly evenness: Evenness;
  readonly underObservedCount: number;
  readonly ledger: readonly LedgerRow[];
  /** Players to look at next, least observed first. Never a ranking of ability. */
  readonly secondLook: readonly LedgerRow[];
  readonly openStints: number;
  readonly missingMinutes: number;
  /** False when no minutes, training or attempts have been recorded at all. */
  readonly hasEvidence: boolean;
  readonly relativeAge: RelativeAgeSummary;
}

export interface FairShareInput {
  readonly players: readonly Player[];
  readonly stints: readonly StintRecord[];
  readonly attendance: readonly AttendanceRecord[];
  readonly observations: readonly ObservationRecord[];
}

function adjustedRate(
  row: OpportunityRow,
  groupRate: number,
  anyAttempts: boolean,
): AdjustedRate | null {
  if (!anyAttempts) return null;
  const drawable = groupRate > 0 && groupRate < 1;
  return {
    point: row.shrunkRate,
    interval: drawable
      ? betaInterval(row.successes, row.attempts, groupRate, PRIOR_STRENGTH, INTERVAL_LEVEL)
      : null,
  };
}

function relativeAgeSummary(
  players: readonly Player[],
  matchMinutes: ReadonlyMap<string, number>,
): RelativeAgeSummary {
  const counts = birthQuarterCounts(players);
  const known = counts.reduce((sum, count) => sum + count, 0);
  if (known < MIN_PLAYERS) return { status: 'needs_more', known };

  const minutes = [0, 0, 0, 0];
  for (const player of players) {
    const quarter = player.birth_quarter;
    if (quarter !== null && quarter >= 1 && quarter <= 4) {
      minutes[quarter - 1] = (minutes[quarter - 1] ?? 0) + (matchMinutes.get(player.id) ?? 0);
    }
  }
  const total = minutes.reduce((sum, value) => sum + value, 0);
  const share = (value: number | undefined): number => (value ?? 0) / total;
  return {
    status: 'ready',
    known,
    unknown: players.length - known,
    result: relativeAgeCheck(counts),
    minuteShares:
      total > 0
        ? [share(minutes[0]), share(minutes[1]), share(minutes[2]), share(minutes[3])]
        : null,
  };
}

export function buildFairShareModel(input: FairShareInput): FairShareModel {
  const squad = squadIds(input.players);
  const match = closedMatchMinutes(input.stints, squad);
  const present = presentAttendance(input.attendance, squad);
  const training = trainingMinutes(present.rows);
  const observed = observationTotals(input.observations, squad);

  const report = buildOpportunityReport(toExposures(input.players, match.minutes, observed), {
    priorStrength: PRIOR_STRENGTH,
    minAttempts: MIN_ATTEMPTS,
  });
  const totalMinutes = report.rows.reduce((sum, row) => sum + row.minutes, 0);
  const anyAttempts = report.rows.some((row) => row.attempts > 0);

  const ledger: LedgerRow[] = report.rows.flatMap((row, index) => {
    const player = input.players[index];
    if (player === undefined) return [];
    return [
      {
        playerId: row.playerId,
        shirt: player.shirt_number,
        label: player.label,
        matchMinutes: row.minutes,
        minutesShare: row.minutesShare,
        // The engine reports what is owed; the ledger reports what was received.
        minutesVersusEqual: row.minutesDebt === 0 ? 0 : -row.minutesDebt,
        trainingMinutes: training.get(row.playerId) ?? 0,
        attempts: row.attempts,
        successes: row.successes,
        sessionsObserved: observed.get(row.playerId)?.sessions ?? 0,
        rawRate: row.rawRate,
        adjusted: adjustedRate(row, report.groupRate, anyAttempts),
        underObserved: row.underObserved,
      },
    ];
  });
  const byId = new Map(ledger.map((row) => [row.playerId, row]));

  return {
    squadSize: input.players.length,
    playersWithMinutes: ledger.filter((row) => row.matchMinutes > 0).length,
    totalMinutes,
    minutesGini: report.minutesGini,
    evenness: evennessOf(report.minutesGini, totalMinutes),
    underObservedCount: ledger.filter((row) => row.underObserved).length,
    ledger,
    secondLook: report.secondLook.flatMap((id) => byId.get(id) ?? []),
    openStints: match.openStints,
    missingMinutes: present.missingMinutes,
    hasEvidence: totalMinutes > 0 || anyAttempts || training.size > 0,
    relativeAge: relativeAgeSummary(input.players, match.minutes),
  };
}

export interface LoadRowModel {
  readonly playerId: string;
  readonly shirt: number;
  readonly label: string;
  readonly load: number;
  readonly sessions: number;
  /** This week's load over the mean of their recent weeks, null when it cannot honestly be formed. */
  readonly ratio: number | null;
  readonly status: LoadStatus;
  /** Match minutes this week: context only, never part of the load. */
  readonly matchMinutes: number;
}

export interface WeekBar {
  readonly weekStart: string;
  readonly load: number;
  /** Players with at least one session that week. */
  readonly players: number;
}

export interface LoadModel {
  readonly rows: readonly LoadRowModel[];
  /** Six weeks, oldest first, ending with the week that holds today. */
  readonly weeks: readonly WeekBar[];
  readonly missingMinutes: number;
  readonly hasEntries: boolean;
}

export interface LoadInput {
  readonly players: readonly Player[];
  readonly attendance: readonly AttendanceRecord[];
  readonly stints: readonly StintRecord[];
  /** 'YYYY-MM-DD', the coach's local date. */
  readonly today: string;
}

export const WEEKS_SHOWN = 6;

export function buildLoadModel(input: LoadInput): LoadModel {
  const squad = squadIds(input.players);
  const present = presentAttendance(input.attendance, squad);
  // Nothing dated after today is read, here as in the engine.
  const entries = toLoadEntries(present.rows).filter((entry) => entry.date <= input.today);
  const reviewed = new Map(
    reviewLoad(entries, { asOf: input.today }).map((row) => [row.playerId, row]),
  );
  const thisMonday = weekStart(input.today);
  const matchThisWeek = closedMatchMinutes(
    input.stints,
    squad,
    (stint) => weekStart(stint.matches.played_on) === thisMonday,
  ).minutes;

  const rows = input.players.map((player): LoadRowModel => {
    const review = reviewed.get(player.id);
    return {
      playerId: player.id,
      shirt: player.shirt_number,
      label: player.label,
      load: review?.thisWeek.load ?? 0,
      sessions: review?.thisWeek.sessions ?? 0,
      ratio: review?.change ?? null,
      status: review?.status ?? 'no_data',
      matchMinutes: matchThisWeek.get(player.id) ?? 0,
    };
  });

  const weekly = weeklyLoad(entries);
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, index): WeekBar => {
    const monday = addDays(thisMonday, -7 * (WEEKS_SHOWN - 1 - index));
    const inWeek = weekly.filter((row) => row.weekStart === monday);
    return {
      weekStart: monday,
      load: inWeek.reduce((sum, row) => sum + row.load, 0),
      players: inWeek.filter((row) => row.sessions > 0).length,
    };
  });
  return { rows, weeks, missingMinutes: present.missingMinutes, hasEntries: entries.length > 0 };
}

export interface PitchModel {
  readonly summary: ResourceSummary;
  readonly sessionCount: number;
  readonly withoutAttendance: number;
}

export interface PitchInput {
  readonly sessions: readonly SessionSummary[];
  readonly attendance: readonly AttendanceRecord[];
  readonly factors: ClubFactors;
}

export function buildPitchModel(input: PitchInput): PitchModel {
  const used = toPitchSessions(input.sessions, input.attendance);
  return {
    summary: summariseResources(used.sessions, toResourceSettings(input.factors)),
    sessionCount: used.sessions.length,
    withoutAttendance: used.withoutAttendance,
  };
}
