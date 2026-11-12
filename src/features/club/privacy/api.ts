import type { Json } from '../../../lib/database';
import { supabase, type Enums, type Row } from '../../../lib/supabase';

/*
 * What an owner can do with the club's data as a whole: take a copy, file and answer data
 * requests, read the activity log, and delete the club. Every call is scoped to the club and
 * every read sets a limit.
 */

function expectRows<T>(rows: T[]): T[] {
  if (rows.length === 0) throw Object.assign(new Error('No rows were changed.'), { code: '42501' });
  return rows;
}

export type DataRequest = Pick<
  Row<'data_requests'>,
  'id' | 'kind' | 'status' | 'created_at' | 'resolved_at'
>;

export async function exportClubData(clubId: string): Promise<Json> {
  const { data, error } = await supabase.rpc('export_club_data', { target_club: clubId });
  if (error !== null) throw error;
  return data;
}

export async function createDataRequest(
  clubId: string,
  kind: Enums['data_request_kind'],
): Promise<string> {
  const { data, error } = await supabase
    .from('data_requests')
    .insert({ club_id: clubId, kind })
    .select('id');
  if (error !== null) throw error;
  const [created] = expectRows(data);
  if (created === undefined) throw new Error('Request was not stored.');
  return created.id;
}

export async function resolveDataRequest(
  clubId: string,
  requestId: string,
  status: Exclude<Enums['data_request_status'], 'open'>,
  resolvedAt: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('data_requests')
    .update({ status, resolved_at: resolvedAt })
    .eq('club_id', clubId)
    .eq('id', requestId)
    .select('id');
  if (error !== null) throw error;
  expectRows(data);
}

export async function listDataRequests(clubId: string): Promise<DataRequest[]> {
  const { data, error } = await supabase
    .from('data_requests')
    .select('id, kind, status, created_at, resolved_at')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error !== null) throw error;
  return data;
}

/**
 * The club and everything it holds, removed by the database's cascading foreign keys in one
 * transaction. Owners only; anyone else, or a second attempt, is answered with 42501.
 */
export async function deleteClub(clubId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_club', { target_club: clubId });
  if (error !== null) throw error;
}

export type AuditEntry = Pick<
  Row<'audit_log'>,
  'id' | 'action' | 'table_name' | 'changed_columns' | 'occurred_at'
>;

export async function listAuditLog(clubId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, table_name, changed_columns, occurred_at')
    .eq('club_id', clubId)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error !== null) throw error;
  return data;
}
