import type { Row } from '../../lib/supabase';

/** The match_events columns this feature reads. */
export type EventRow = Pick<
  Row<'match_events'>,
  | 'id'
  | 'client_id'
  | 'match_id'
  | 'period'
  | 'clock_seconds'
  | 'side'
  | 'kind'
  | 'weight'
  | 'x'
  | 'y'
  | 'header'
  | 'created_at'
  | 'deleted_at'
>;

/**
 * What the tagger sends for one event. `created_by` and `created_at` are left to the database
 * defaults so the author check and the write limit see the real author and server time.
 */
export interface EventInsert {
  readonly client_id: string;
  readonly club_id: string;
  readonly match_id: string;
  readonly period: number;
  readonly clock_seconds: number;
  readonly side: Row<'match_events'>['side'];
  readonly kind: Row<'match_events'>['kind'];
  readonly weight: number;
  readonly x: number | null;
  readonly y: number | null;
  readonly header: boolean;
}

/** The stints columns this feature reads. */
export type StintRow = Pick<
  Row<'stints'>,
  'id' | 'player_id' | 'period' | 'on_seconds' | 'off_seconds'
>;

export type MatchStatus = Row<'matches'>['status'];
