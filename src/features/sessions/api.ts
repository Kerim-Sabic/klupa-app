import type { SessionSummary } from '../../lib/data';
import { supabase, type Enums, type Row } from '../../lib/supabase';
import type { SessionValues } from './values';
import type { AttendanceValue, Tally } from './tally';

const SESSION_COLUMNS =
  'id, held_on, status, focus, duration_minutes, area, expected_players, floodlit, source_match_id';
const DRILL_COLUMNS = 'id, position, drill_key, minutes';
const ATTENDANCE_COLUMNS = 'player_id, status, minutes, rpe';
const OBSERVATION_COLUMNS = 'player_id, attempts, successes';

export type SessionDrillRow = Pick<
  Row<'session_drills'>,
  'id' | 'position' | 'drill_key' | 'minutes'
>;
export type AttendanceRow = Pick<
  Row<'session_attendance'>,
  'player_id' | 'status' | 'minutes' | 'rpe'
>;
export type ObservationRow = Pick<Row<'observations'>, 'player_id' | 'attempts' | 'successes'>;

export interface SessionDetail {
  readonly session: SessionSummary;
  readonly drills: SessionDrillRow[];
}

interface ClubScope {
  readonly clubId: string;
  readonly teamId: string;
}

/** One session and its drills in order, or null when it is not in this club. */
export async function fetchSession(
  clubId: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const [sessions, drills] = await Promise.all([
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('club_id', clubId)
      .eq('id', sessionId)
      .limit(1),
    supabase
      .from('session_drills')
      .select(DRILL_COLUMNS)
      .eq('club_id', clubId)
      .eq('session_id', sessionId)
      .order('position', { ascending: true })
      .limit(12),
  ]);
  if (sessions.error !== null) throw sessions.error;
  if (drills.error !== null) throw drills.error;
  const session = sessions.data[0];
  return session === undefined ? null : { session, drills: drills.data };
}

export async function fetchAttendance(clubId: string, sessionId: string): Promise<AttendanceRow[]> {
  const { data, error } = await supabase
    .from('session_attendance')
    .select(ATTENDANCE_COLUMNS)
    .eq('club_id', clubId)
    .eq('session_id', sessionId)
    .limit(200);
  if (error !== null) throw error;
  return data;
}

export async function fetchObservations(
  clubId: string,
  sessionId: string,
  skill: string,
): Promise<ObservationRow[]> {
  const { data, error } = await supabase
    .from('observations')
    .select(OBSERVATION_COLUMNS)
    .eq('club_id', clubId)
    .eq('session_id', sessionId)
    .eq('skill', skill)
    .limit(200);
  if (error !== null) throw error;
  return data;
}

/**
 * The session, its drills and one `expected` attendance row per player, stored by one
 * database function: all of it or none of it, so a failure never leaves half a plan behind.
 */
export async function insertSession(scope: ClubScope, values: SessionValues): Promise<string> {
  const { data, error } = await supabase.rpc('plan_session', {
    target_club: scope.clubId,
    target_team: scope.teamId,
    plan: {
      session: values.session,
      drills: values.drills.map((drill) => ({ ...drill })),
      player_ids: [...values.playerIds],
    },
  });
  if (error !== null) throw error;
  return data;
}

/** Only a planned session can be completed or cancelled; the filter makes a repeat tap a no-op. */
export async function updateSessionStatus(
  clubId: string,
  sessionId: string,
  status: Extract<Enums['session_status'], 'completed' | 'cancelled'>,
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status })
    .eq('club_id', clubId)
    .eq('id', sessionId)
    .eq('status', 'planned');
  if (error !== null) throw error;
}

/*
 * Both writes below store the row, or correct it when it is already there, in one statement
 * inside the database. A plain `upsert` from here would also assign club_id, session_id and
 * player_id on the update, which the column grants refuse.
 */

export async function upsertAttendance(
  clubId: string,
  sessionId: string,
  playerId: string,
  value: AttendanceValue,
): Promise<void> {
  const { error } = await supabase.rpc('record_attendance', {
    target_club: clubId,
    target_session: sessionId,
    target_player: playerId,
    new_status: value.status,
    // Left out, not sent as null: the database then stores "not recorded".
    ...(value.minutes === null ? {} : { new_minutes: value.minutes }),
    ...(value.rpe === null ? {} : { new_rpe: value.rpe }),
  });
  if (error !== null) throw error;
}

export async function upsertObservation(
  clubId: string,
  sessionId: string,
  playerId: string,
  skill: string,
  tally: Tally,
): Promise<void> {
  const { error } = await supabase.rpc('record_observation', {
    target_club: clubId,
    target_session: sessionId,
    target_player: playerId,
    skill_key: skill,
    new_attempts: tally.attempts,
    new_successes: tally.successes,
  });
  if (error !== null) throw error;
}
