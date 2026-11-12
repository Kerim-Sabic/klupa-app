import type { Json } from '../../lib/database';
import { supabase, type Row, type Tables } from '../../lib/supabase';

/*
 * Squad, settings and the sample season. Every call names its columns and is scoped to the
 * club; every read sets a limit. Writes carry no `.limit()` on purpose: PostgREST refuses a
 * limit on an update that is not ordered, and each write is already bounded by a primary-key
 * filter. A write that row-level security filters out comes back as "no rows", not as an
 * error, so `expectRows` turns that into the same "forbidden" code the database uses.
 *
 * Anything that changes several rows or tables, and every erasure, is one database function
 * (see supabase/migrations/*_atomic_writes.sql): it is stored whole or not at all, and the
 * browser never strings writes together or issues a delete of its own.
 */

type Insert<Name extends keyof Tables> = Tables[Name]['Insert'];

function expectRows<T>(rows: T[]): T[] {
  if (rows.length === 0) throw Object.assign(new Error('No rows were changed.'), { code: '42501' });
  return rows;
}

/* ---------------------------------------------------------------- squad */

export type PlayerUpdate = Partial<
  Pick<
    Row<'players'>,
    'label' | 'shirt_number' | 'consent' | 'consent_recorded_at' | 'birth_quarter' | 'archived_at'
  >
>;

export async function insertPlayer(row: Insert<'players'>): Promise<void> {
  const { error } = await supabase.from('players').insert(row);
  if (error !== null) throw error;
}

export async function updatePlayer(
  clubId: string,
  playerId: string,
  patch: PlayerUpdate,
): Promise<void> {
  const { data, error } = await supabase
    .from('players')
    .update(patch)
    .eq('club_id', clubId)
    .eq('id', playerId)
    .select('id');
  if (error !== null) throw error;
  expectRows(data);
}

/** Erasure, not archiving: the row goes, and the database answers 42501 if it was not there. */
export async function erasePlayer(clubId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('erase_player', {
    target_club: clubId,
    target_player: playerId,
  });
  if (error !== null) throw error;
}

export async function countActivePlayers(clubId: string, teamId: string): Promise<number> {
  const { count, error } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('team_id', teamId)
    .is('archived_at', null)
    .limit(1);
  if (error !== null) throw error;
  return count ?? 0;
}

/* ------------------------------------------------------------- settings */

export type ClubSettings = Pick<
  Row<'clubs'>,
  'name' | 'floodlight_kw' | 'tariff_per_kwh' | 'grid_kg_co2_per_kwh'
>;

export async function fetchClubSettings(clubId: string): Promise<ClubSettings> {
  const { data, error } = await supabase
    .from('clubs')
    .select('name, floodlight_kw, tariff_per_kwh, grid_kg_co2_per_kwh')
    .eq('id', clubId)
    .limit(1);
  if (error !== null) throw error;
  const [settings] = expectRows(data);
  if (settings === undefined) throw new Error('Club not found.');
  return settings;
}

export async function updateClubSettings(clubId: string, patch: ClubSettings): Promise<void> {
  const { data, error } = await supabase.from('clubs').update(patch).eq('id', clubId).select('id');
  if (error !== null) throw error;
  expectRows(data);
}

/* -------------------------------------------------------- sample season */

/** A whole season in one database transaction: every row is stored, or none is. */
export async function importSeason(clubId: string, teamId: string, season: Json): Promise<void> {
  const { error } = await supabase.rpc('import_season', {
    target_club: clubId,
    target_team: teamId,
    season,
  });
  if (error !== null) throw error;
}
