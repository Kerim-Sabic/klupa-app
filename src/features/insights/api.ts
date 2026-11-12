import { supabase } from '../../lib/supabase';
import type { AttendanceRecord, ClubFactors, ObservationRecord, StintRecord } from './types';

/*
 * Every read the insights feature makes. Rows are fetched for the whole team and
 * filtered to its matches and sessions by an inner join, so a stint or an
 * attendance row of another team can never arrive. The server caps a response at
 * about a thousand rows, so lists are read a page at a time rather than silently cut.
 */

const PAGE_SIZE = 1000;
/** Twenty thousand rows is far beyond a season for one squad; the cap only stops a runaway loop. */
const MAX_PAGES = 20;

interface PageResult<Row> {
  readonly data: Row[] | null;
  readonly error: Error | null;
}

async function readAll<Row>(
  page: (from: number, to: number) => PromiseLike<PageResult<Row>>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error !== null) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return rows;
}

/** Every stint of every match the team has played; open ones come back with a null `off_seconds`. */
export function fetchTeamStints(clubId: string, teamId: string): Promise<StintRecord[]> {
  return readAll((from, to) =>
    supabase
      .from('stints')
      .select('player_id, on_seconds, off_seconds, matches!inner(played_on)')
      .eq('club_id', clubId)
      .eq('matches.team_id', teamId)
      .order('id', { ascending: true })
      .range(from, to)
      .limit(PAGE_SIZE),
  );
}

/** Attendance of the team's sessions, with each session's date and status. */
export function fetchTeamAttendance(clubId: string, teamId: string): Promise<AttendanceRecord[]> {
  return readAll((from, to) =>
    supabase
      .from('session_attendance')
      .select('player_id, session_id, status, minutes, rpe, sessions!inner(held_on, status)')
      .eq('club_id', clubId)
      .eq('sessions.team_id', teamId)
      .order('session_id', { ascending: true })
      .order('player_id', { ascending: true })
      .range(from, to)
      .limit(PAGE_SIZE),
  );
}

/** What was observed in the team's sessions: attempts and successes per player and skill. */
export function fetchTeamObservations(
  clubId: string,
  teamId: string,
): Promise<ObservationRecord[]> {
  return readAll((from, to) =>
    supabase
      .from('observations')
      .select('player_id, session_id, attempts, successes, sessions!inner(team_id)')
      .eq('club_id', clubId)
      .eq('sessions.team_id', teamId)
      .order('id', { ascending: true })
      .range(from, to)
      .limit(PAGE_SIZE),
  );
}

/** The factors a club typed in for facility estimates. Any of them may be null. */
export async function fetchClubFactors(clubId: string): Promise<ClubFactors> {
  const { data, error } = await supabase
    .from('clubs')
    .select('floodlight_kw, tariff_per_kwh, grid_kg_co2_per_kwh')
    .eq('id', clubId)
    .limit(1)
    .single();
  if (error !== null) throw error;
  return data;
}
