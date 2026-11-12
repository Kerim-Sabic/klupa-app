import type { LoadEntry, PitchSession, PlayerExposure, ResourceSettings } from '../../engine';
import type { QuarterCounts } from '../../engine/relativeAge';
import type { Player, SessionSummary } from '../../lib/data';
import type { AttendanceRecord, ClubFactors, ObservationRecord, StintRecord } from './types';

/*
 * Rows in, engine inputs out. Everything here is a pure function so the rules
 * for what counts (and what is left out, and said so) can be tested directly.
 *
 * Three rules keep the numbers honest:
 *  - an open stint (a player still on, or never taken off) has no known length,
 *    so it adds nothing and is counted for a visible note;
 *  - attendance with no minutes recorded is left out and counted, never guessed;
 *  - only the active squad is read, so another team's or an archived player's
 *    rows can never leak into a ledger.
 */

/** Calendar date of a moment in the coach's own time zone, as 'YYYY-MM-DD'. */
export function localIsoDate(moment: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(moment.getFullYear())}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

/** A calendar date moved by whole days, in UTC so daylight saving cannot shift it. */
export function addDays(isoDate: string, days: number): string {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function squadIds(players: readonly Player[]): ReadonlySet<string> {
  return new Set(players.map((player) => player.id));
}

export interface MatchMinutes {
  /** Minutes per player id, one decimal. Players who never played are absent. */
  readonly minutes: ReadonlyMap<string, number>;
  /** Stints still open for squad players: ignored, and said so. */
  readonly openStints: number;
}

/**
 * Minutes on the pitch from closed stints: the sum of (off - on) seconds over 60,
 * rounded to one decimal once per player so rounding never accumulates.
 * `include` narrows to some matches, for example this week's.
 */
export function closedMatchMinutes(
  stints: readonly StintRecord[],
  squad: ReadonlySet<string>,
  include: (stint: StintRecord) => boolean = () => true,
): MatchMinutes {
  const seconds = new Map<string, number>();
  let openStints = 0;
  for (const stint of stints) {
    if (!squad.has(stint.player_id) || !include(stint)) continue;
    if (stint.off_seconds === null) {
      openStints += 1;
      continue;
    }
    seconds.set(
      stint.player_id,
      (seconds.get(stint.player_id) ?? 0) + (stint.off_seconds - stint.on_seconds),
    );
  }
  const minutes = new Map<string, number>();
  for (const [playerId, total] of seconds) minutes.set(playerId, Math.round(total / 6) / 10);
  return { minutes, openStints };
}

export interface PresentRow extends AttendanceRecord {
  readonly minutes: number;
}

export interface PresentAttendance {
  readonly rows: readonly PresentRow[];
  /** Present rows with no minutes recorded: left out, and said so. */
  readonly missingMinutes: number;
}

/**
 * Squad members marked present at a session that was not cancelled. A present
 * mark under a cancelled session contradicts itself, so it is not trusted.
 */
export function presentAttendance(
  rows: readonly AttendanceRecord[],
  squad: ReadonlySet<string>,
): PresentAttendance {
  const present: PresentRow[] = [];
  let missingMinutes = 0;
  for (const row of rows) {
    if (row.status !== 'present' || row.sessions.status === 'cancelled') continue;
    if (!squad.has(row.player_id)) continue;
    if (row.minutes === null) missingMinutes += 1;
    else present.push({ ...row, minutes: row.minutes });
  }
  return { rows: present, missingMinutes };
}

export function trainingMinutes(rows: readonly PresentRow[]): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + row.minutes);
  return totals;
}

export interface ObservationTotals {
  readonly attempts: number;
  readonly successes: number;
  /** Sessions in which at least one attempt was observed. */
  readonly sessions: number;
}

/** Attempts and successes per player, pooled over every recorded skill. */
export function observationTotals(
  rows: readonly ObservationRecord[],
  squad: ReadonlySet<string>,
): ReadonlyMap<string, ObservationTotals> {
  const sessionSets = new Map<string, Set<string>>();
  const totals = new Map<string, { attempts: number; successes: number }>();
  for (const row of rows) {
    if (!squad.has(row.player_id)) continue;
    const sum = totals.get(row.player_id) ?? { attempts: 0, successes: 0 };
    totals.set(row.player_id, {
      attempts: sum.attempts + row.attempts,
      successes: sum.successes + row.successes,
    });
    if (row.attempts > 0) {
      const seen = sessionSets.get(row.player_id) ?? new Set<string>();
      seen.add(row.session_id);
      sessionSets.set(row.player_id, seen);
    }
  }
  const result = new Map<string, ObservationTotals>();
  for (const [playerId, sum] of totals) {
    result.set(playerId, { ...sum, sessions: sessionSets.get(playerId)?.size ?? 0 });
  }
  return result;
}

/** One exposure per squad player, in squad order, zeros for players with no records. */
export function toExposures(
  players: readonly Player[],
  matchMinutes: ReadonlyMap<string, number>,
  observed: ReadonlyMap<string, ObservationTotals>,
): PlayerExposure[] {
  return players.map((player) => ({
    playerId: player.id,
    minutes: matchMinutes.get(player.id) ?? 0,
    attempts: observed.get(player.id)?.attempts ?? 0,
    successes: observed.get(player.id)?.successes ?? 0,
  }));
}

/** Load entries: present rows with minutes, dated by their session. Matches carry no rating. */
export function toLoadEntries(rows: readonly PresentRow[]): LoadEntry[] {
  return rows.map((row) => ({
    playerId: row.player_id,
    date: row.sessions.held_on,
    minutes: row.minutes,
    rpe: row.rpe,
    kind: 'session',
  }));
}

/** Players per quarter of birth; players without a recorded quarter are not counted. */
export function birthQuarterCounts(players: readonly Player[]): QuarterCounts {
  const counts = [0, 0, 0, 0];
  for (const player of players) {
    const quarter = player.birth_quarter;
    if (quarter !== null && quarter >= 1 && quarter <= 4) {
      counts[quarter - 1] = (counts[quarter - 1] ?? 0) + 1;
    }
  }
  return [counts[0] ?? 0, counts[1] ?? 0, counts[2] ?? 0, counts[3] ?? 0];
}

export interface PitchInputs {
  readonly sessions: readonly PitchSession[];
  /** Completed sessions with nobody marked present: left out, because "not recorded" is not "empty". */
  readonly withoutAttendance: number;
}

/**
 * Completed sessions, with attended = the number of present rows. A completed
 * session with no one marked present has no attendance recorded, not zero
 * children, so it is left out of every figure and counted for a note.
 */
export function toPitchSessions(
  sessions: readonly SessionSummary[],
  attendance: readonly AttendanceRecord[],
): PitchInputs {
  const attended = new Map<string, number>();
  for (const row of attendance) {
    if (row.status === 'present')
      attended.set(row.session_id, (attended.get(row.session_id) ?? 0) + 1);
  }
  const used: PitchSession[] = [];
  let withoutAttendance = 0;
  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    const count = attended.get(session.id) ?? 0;
    if (count === 0) {
      withoutAttendance += 1;
      continue;
    }
    used.push({
      id: session.id,
      date: session.held_on,
      durationMinutes: session.duration_minutes,
      area: session.area,
      attended: count,
      floodlit: session.floodlit,
    });
  }
  return { sessions: used, withoutAttendance };
}

export function toResourceSettings(factors: ClubFactors): ResourceSettings {
  return {
    floodlightKw: factors.floodlight_kw,
    tariffPerKwh: factors.tariff_per_kwh,
    gridKgCo2PerKwh: factors.grid_kg_co2_per_kwh,
  };
}
