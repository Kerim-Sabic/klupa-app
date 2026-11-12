import type { MatchSummary } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import type { EventInsert, EventRow, MatchStatus, StintRow } from './model';

const MATCH_COLUMNS = 'id, opponent, played_on, status, period_count, period_minutes';
const EVENT_COLUMNS =
  'id, client_id, match_id, period, clock_seconds, side, kind, weight, x, y, header, created_at, deleted_at';
const STINT_COLUMNS = 'id, player_id, period, on_seconds, off_seconds';

export async function fetchMatch(clubId: string, matchId: string): Promise<MatchSummary | null> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('club_id', clubId)
    .eq('id', matchId)
    .limit(1)
    .maybeSingle();
  if (error !== null) throw error;
  return data;
}

export interface CreateMatchInput {
  readonly clubId: string;
  readonly teamId: string;
  readonly opponent: string;
  readonly playedOn: string;
  readonly periodCount: number;
  readonly periodMinutes: number;
}

export async function createMatch(input: CreateMatchInput): Promise<string> {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      club_id: input.clubId,
      team_id: input.teamId,
      opponent: input.opponent,
      played_on: input.playedOn,
      period_count: input.periodCount,
      period_minutes: input.periodMinutes,
    })
    .select('id')
    .limit(1)
    .single();
  if (error !== null) throw error;
  return data.id;
}

export async function setMatchStatus(
  clubId: string,
  matchId: string,
  status: MatchStatus,
): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ status })
    .eq('club_id', clubId)
    .eq('id', matchId);
  if (error !== null) throw error;
}

export async function fetchEvents(clubId: string, matchId: string): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select(EVENT_COLUMNS)
    .eq('club_id', clubId)
    .eq('match_id', matchId)
    .order('period', { ascending: true })
    .order('clock_seconds', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error !== null) throw error;
  return data;
}

/** Goals of several matches, for the scores on the match list. */
export async function fetchGoals(clubId: string, matchIds: readonly string[]): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select(EVENT_COLUMNS)
    .eq('club_id', clubId)
    .in('match_id', [...matchIds])
    .eq('kind', 'goal')
    .is('deleted_at', null)
    .limit(2000);
  if (error !== null) throw error;
  return data;
}

/** Idempotent: a retried upload of the same (match_id, client_id) is ignored by the database. */
export async function upsertEvent(row: EventInsert): Promise<void> {
  const { error } = await supabase
    .from('match_events')
    .upsert(row, { onConflict: 'match_id,client_id', ignoreDuplicates: true });
  if (error !== null) throw error;
}

/** Undo is a soft delete; only `deleted_at` may be updated on an event. */
export async function undoEvent(
  clubId: string,
  matchId: string,
  clientId: string,
  deletedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from('match_events')
    .update({ deleted_at: deletedAt })
    .eq('club_id', clubId)
    .eq('match_id', matchId)
    .eq('client_id', clientId)
    .is('deleted_at', null);
  if (error !== null) throw error;
}

export async function fetchStints(clubId: string, matchId: string): Promise<StintRow[]> {
  const { data, error } = await supabase
    .from('stints')
    .select(STINT_COLUMNS)
    .eq('club_id', clubId)
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error !== null) throw error;
  return data;
}

/** One step of a lineup change, in the shape the database's `apply_lineup` reads. */
export type LineupStep =
  | {
      readonly type: 'on';
      readonly player: string;
      readonly period: number;
      readonly on_seconds: number;
    }
  | { readonly type: 'off'; readonly stint: string; readonly off_seconds: number }
  | { readonly type: 'remove'; readonly stint: string };

/**
 * A lineup change is stored whole or not at all: a substitution is two steps, and half of one
 * would leave the minutes wrong. The database runs the steps in one transaction.
 */
export async function applyLineup(
  clubId: string,
  matchId: string,
  steps: readonly LineupStep[],
): Promise<void> {
  const { error } = await supabase.rpc('apply_lineup', {
    target_club: clubId,
    target_match: matchId,
    changes: steps.map((step) => ({ ...step })),
  });
  if (error !== null) throw error;
}
