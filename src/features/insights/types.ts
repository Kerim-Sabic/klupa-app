import type { Enums } from '../../lib/supabase';

/*
 * The row shapes the feature reads. They are the columns `api.ts` selects,
 * named here so the helpers in `transform.ts` can be tested without a database.
 */

/** One stretch of one player on the pitch. `off_seconds` is null while it is still open. */
export interface StintRecord {
  readonly player_id: string;
  readonly on_seconds: number;
  readonly off_seconds: number | null;
  readonly matches: { readonly played_on: string };
}

export interface AttendanceRecord {
  readonly player_id: string;
  readonly session_id: string;
  readonly status: Enums['attendance_status'];
  readonly minutes: number | null;
  readonly rpe: number | null;
  readonly sessions: { readonly held_on: string; readonly status: Enums['session_status'] };
}

export interface ObservationRecord {
  readonly player_id: string;
  readonly session_id: string;
  readonly attempts: number;
  readonly successes: number;
}

/** The numbers a club types in for facility estimates; each may be unset. */
export interface ClubFactors {
  readonly floodlight_kw: number | null;
  readonly tariff_per_kwh: number | null;
  readonly grid_kg_co2_per_kwh: number | null;
}
