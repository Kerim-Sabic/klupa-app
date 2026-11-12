import { EngineError } from './types';

/*
 * Training-load monitoring, kept deliberately small and deliberately modest.
 *
 * What this module is for: telling a volunteer coach "this week looks very
 * different from the last few" or "we have not recorded enough to say". Both are
 * prompts for a conversation with the child and the parents.
 *
 * What it is not: an injury model. A week-on-week ratio says nothing reliable
 * about any single child, so no function here returns a risk score, a
 * probability, a traffic-light "danger" level or a clearance to play. The
 * ratio is shown as a plain number and a plain status, never converted to a
 * risk, because the research behind load ratios does not support individual
 * prediction and a number that looks like risk would be read as one.
 *
 * Thresholds (`spikeRatio`, `minBaselineWeeks`, `minRatedShare`) are
 * configurable conversation prompts, not clinical limits. A previous week only
 * counts towards the baseline if it meets `minRatedShare` too, otherwise a
 * baseline built on half-recorded weeks would make a normal week look like a
 * spike. A week with no entries between a child's first recorded week and the
 * current one counts as a real rest week (load 0): coaches who log nothing
 * usually did nothing, and a rest week is information.
 *
 * Like the rest of the engine this never looks ahead: entries dated after
 * `asOf` are ignored by `reviewLoad`.
 */

export type LoadEntryKind = 'match' | 'session';

/** One recorded match or session for one child. Counts only, no names. */
export interface LoadEntry {
  /** Pseudonymous roster id. */
  readonly playerId: string;
  /** Calendar date, 'YYYY-MM-DD'. */
  readonly date: string;
  /** Minutes the child took part. */
  readonly minutes: number;
  /** Effort rating 1-10, or null when it was not recorded. */
  readonly rpe: number | null;
  readonly kind: LoadEntryKind;
}

/** Totals for one player in one ISO week. */
export interface WeekTotals {
  readonly minutes: number;
  /** Arbitrary units: sum of minutes x rpe over entries that have an rpe. */
  readonly load: number;
  readonly ratedMinutes: number;
  readonly unratedMinutes: number;
  readonly sessions: number;
}

export interface WeeklyLoadRow extends WeekTotals {
  readonly playerId: string;
  /** The Monday of the week, 'YYYY-MM-DD'. */
  readonly weekStart: string;
}

export type LoadStatus = 'no_data' | 'incomplete' | 'no_baseline' | 'sharp_increase' | 'steady';

export interface LoadReviewOptions {
  /** The date being read; the week containing it is "this week". */
  readonly asOf: string;
  /** Ratio at or above which a week is a sharp increase. Default 1.3. */
  readonly spikeRatio?: number;
  /** Usable previous weeks needed to form a baseline. Default 2. */
  readonly minBaselineWeeks?: number;
  /** Share of a week's minutes that must have an rpe. Default 0.7. */
  readonly minRatedShare?: number;
}

export interface LoadReviewRow {
  readonly playerId: string;
  readonly thisWeek: WeekTotals;
  /** Mean load of the usable previous weeks, null with too few of them. */
  readonly baselineMean: number | null;
  /** thisWeek.load / baselineMean, null when it cannot honestly be formed. */
  readonly change: number | null;
  readonly status: LoadStatus;
  /** Longest run of consecutive days with an entry in the 7 days to asOf. */
  readonly consecutiveDays: number;
}

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: readonly string[] = ['match', 'session'];

function dayNumberOrNull(date: string): number | null {
  if (!DATE_PATTERN.test(date)) return null;
  const day = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8)),
  );
  // Round-trip so 2026-02-30 and year 0050 are rejected, not silently shifted.
  return fromDayNumber(Math.floor(day / DAY_MS)) === date ? Math.floor(day / DAY_MS) : null;
}

function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** True when the text is a real calendar date written 'YYYY-MM-DD'. */
export function isIsoDate(value: string): boolean {
  return dayNumberOrNull(value) !== null;
}

function toDayNumber(date: string): number {
  const day = dayNumberOrNull(date);
  if (day === null) {
    throw new EngineError('INVALID_EXPOSURE', `Date must be a real 'YYYY-MM-DD' date: ${date}`);
  }
  return day;
}

/** Day 0 (1970-01-01) was a Thursday, hence the +3 to count from Monday. */
function mondayOf(day: number): number {
  return day - ((((day + 3) % 7) + 7) % 7);
}

/** The Monday (ISO week start) of a date, in UTC, as 'YYYY-MM-DD'. */
export function weekStart(date: string): string {
  return fromDayNumber(mondayOf(toDayNumber(date)));
}

function assertEntry(entry: LoadEntry): void {
  if (entry.playerId.length === 0) {
    throw new EngineError('INVALID_EXPOSURE', 'Load entry needs a player id.');
  }
  toDayNumber(entry.date);
  if (!Number.isFinite(entry.minutes) || entry.minutes < 0) {
    throw new EngineError(
      'INVALID_EXPOSURE',
      `Player ${entry.playerId}: minutes must be 0 or more.`,
    );
  }
  if (entry.rpe !== null && (!Number.isFinite(entry.rpe) || entry.rpe < 1 || entry.rpe > 10)) {
    throw new EngineError('INVALID_EXPOSURE', `Player ${entry.playerId}: rpe must be 1 to 10.`);
  }
  if (!KINDS.includes(entry.kind)) {
    throw new EngineError('INVALID_EXPOSURE', `Player ${entry.playerId}: unknown entry kind.`);
  }
}

function emptyTotals(): WeekTotals {
  return { minutes: 0, load: 0, ratedMinutes: 0, unratedMinutes: 0, sessions: 0 };
}

function addEntry(totals: WeekTotals, entry: LoadEntry): WeekTotals {
  const rated = entry.rpe !== null;
  return {
    minutes: totals.minutes + entry.minutes,
    load: totals.load + (entry.rpe === null ? 0 : entry.minutes * entry.rpe),
    ratedMinutes: totals.ratedMinutes + (rated ? entry.minutes : 0),
    unratedMinutes: totals.unratedMinutes + (rated ? 0 : entry.minutes),
    sessions: totals.sessions + 1,
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type PlayerWeeks = Map<string, Map<number, WeekTotals>>;

/** Group already-validated entries by player, then by Monday day number. */
function groupByPlayerWeek(entries: readonly LoadEntry[]): PlayerWeeks {
  const grouped: PlayerWeeks = new Map();
  for (const entry of entries) {
    const weeks = grouped.get(entry.playerId) ?? new Map<number, WeekTotals>();
    const monday = mondayOf(toDayNumber(entry.date));
    weeks.set(monday, addEntry(weeks.get(monday) ?? emptyTotals(), entry));
    grouped.set(entry.playerId, weeks);
  }
  return grouped;
}

function sortedPlayers(grouped: PlayerWeeks): [string, Map<number, WeekTotals>][] {
  return [...grouped].sort(([a], [b]) => compareText(a, b));
}

/**
 * Weekly totals per player. Weeks between a player's first and last recorded
 * week that have no entries appear with zeros: a rest week is information.
 */
export function weeklyLoad(entries: readonly LoadEntry[]): readonly WeeklyLoadRow[] {
  entries.forEach(assertEntry);
  const rows: WeeklyLoadRow[] = [];
  for (const [playerId, weeks] of sortedPlayers(groupByPlayerWeek(entries))) {
    const mondays = [...weeks.keys()];
    const last = Math.max(...mondays);
    for (let monday = Math.min(...mondays); monday <= last; monday += 7) {
      rows.push({
        playerId,
        weekStart: fromDayNumber(monday),
        ...(weeks.get(monday) ?? emptyTotals()),
      });
    }
  }
  return rows;
}

/** Share of a week's minutes that carry an rpe; a week with no minutes has nothing unrated. */
function ratedShare(week: WeekTotals): number {
  return week.minutes === 0 ? 1 : week.ratedMinutes / week.minutes;
}

function longestRun(days: ReadonlySet<number>, from: number, to: number): number {
  let best = 0;
  let run = 0;
  for (let day = from; day <= to; day += 1) {
    run = days.has(day) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

interface Thresholds {
  readonly spikeRatio: number;
  readonly minBaselineWeeks: number;
  readonly minRatedShare: number;
}

function reviewPlayer(
  playerId: string,
  weeks: ReadonlyMap<number, WeekTotals>,
  entryDays: ReadonlySet<number>,
  asOfDay: number,
  limits: Thresholds,
): LoadReviewRow {
  const thisMonday = mondayOf(asOfDay);
  const thisWeek = weeks.get(thisMonday) ?? emptyTotals();
  const firstWeek = Math.min(...weeks.keys());
  const baselineLoads: number[] = [];
  for (let back = 1; back <= 3 && thisMonday - 7 * back >= firstWeek; back += 1) {
    const week = weeks.get(thisMonday - 7 * back) ?? emptyTotals();
    if (ratedShare(week) >= limits.minRatedShare) baselineLoads.push(week.load);
  }
  const baselineMean =
    baselineLoads.length < limits.minBaselineWeeks
      ? null
      : baselineLoads.reduce((sum, load) => sum + load, 0) / baselineLoads.length;
  const consecutiveDays = longestRun(entryDays, asOfDay - 6, asOfDay);

  if (thisWeek.sessions === 0) {
    return { playerId, thisWeek, baselineMean, change: null, status: 'no_data', consecutiveDays };
  }
  if (ratedShare(thisWeek) < limits.minRatedShare) {
    return {
      playerId,
      thisWeek,
      baselineMean,
      change: null,
      status: 'incomplete',
      consecutiveDays,
    };
  }
  if (baselineMean === null || baselineMean === 0) {
    return {
      playerId,
      thisWeek,
      baselineMean,
      change: null,
      status: 'no_baseline',
      consecutiveDays,
    };
  }
  const change = thisWeek.load / baselineMean;
  const status = change >= limits.spikeRatio ? 'sharp_increase' : 'steady';
  return { playerId, thisWeek, baselineMean, change, status, consecutiveDays };
}

/**
 * Compare each player's week containing `asOf` with the mean of up to the three
 * weeks before it. Returns facts and one status per player; never a risk.
 */
export function reviewLoad(
  entries: readonly LoadEntry[],
  options: LoadReviewOptions,
): readonly LoadReviewRow[] {
  const asOfDay = toDayNumber(options.asOf);
  const limits: Thresholds = {
    spikeRatio: options.spikeRatio ?? 1.3,
    minBaselineWeeks: options.minBaselineWeeks ?? 2,
    minRatedShare: options.minRatedShare ?? 0.7,
  };
  if (!(limits.spikeRatio > 0) || !Number.isFinite(limits.spikeRatio)) {
    throw new EngineError('INVALID_EXPOSURE', 'spikeRatio must be a number above 0.');
  }
  if (!Number.isInteger(limits.minBaselineWeeks) || limits.minBaselineWeeks < 1) {
    throw new EngineError(
      'INVALID_EXPOSURE',
      'minBaselineWeeks must be a whole number, 1 or more.',
    );
  }
  if (!(limits.minRatedShare >= 0 && limits.minRatedShare <= 1)) {
    throw new EngineError('INVALID_EXPOSURE', 'minRatedShare must be between 0 and 1.');
  }
  entries.forEach(assertEntry);

  const visible = entries.filter((entry) => toDayNumber(entry.date) <= asOfDay);
  return sortedPlayers(groupByPlayerWeek(visible)).map(([playerId, weeks]) => {
    const entryDays = new Set(
      visible
        .filter((entry) => entry.playerId === playerId)
        .map((entry) => toDayNumber(entry.date)),
    );
    return reviewPlayer(playerId, weeks, entryDays, asOfDay, limits);
  });
}
