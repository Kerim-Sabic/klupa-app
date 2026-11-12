import type { Enums } from '../../lib/supabase';

/** Plain data for one invented season. Players are referred to by their index in `players`. */
export type BirthQuarter = 1 | 2 | 3 | 4;

export interface SeedPlayer {
  readonly label: string;
  readonly shirtNumber: number;
  readonly birthQuarter: BirthQuarter;
}

export interface SeedEvent {
  readonly clientId: string;
  readonly period: number;
  /** Seconds since the start of the period. */
  readonly clockSeconds: number;
  readonly side: Enums['event_side'];
  readonly kind: Enums['event_kind'];
  /** Chance quality in 1/10,000 of a goal. */
  readonly weight: number;
  readonly playerIndex: number | null;
  readonly x: number | null;
  readonly y: number | null;
  readonly header: boolean;
}

export interface SeedStint {
  readonly playerIndex: number;
  readonly period: number;
  readonly onSeconds: number;
  readonly offSeconds: number;
}

export interface SeedMatch {
  readonly opponent: string;
  readonly playedOn: string;
  readonly periodCount: number;
  readonly periodMinutes: number;
  readonly events: readonly SeedEvent[];
  readonly stints: readonly SeedStint[];
}

export interface SeedDrill {
  readonly position: number;
  readonly drillKey: string;
  readonly minutes: number;
}

export interface SeedAttendance {
  readonly playerIndex: number;
  readonly status: Enums['attendance_status'];
  readonly minutes: number | null;
  readonly rpe: number | null;
}

export interface SeedObservation {
  readonly playerIndex: number;
  readonly skill: string;
  readonly attempts: number;
  readonly successes: number;
}

export interface SeedSession {
  readonly heldOn: string;
  readonly focus: string;
  readonly durationMinutes: number;
  readonly area: Enums['pitch_area'];
  readonly expectedPlayers: number;
  readonly floodlit: boolean;
  readonly drills: readonly SeedDrill[];
  readonly attendance: readonly SeedAttendance[];
  readonly observations: readonly SeedObservation[];
}

export interface SeasonData {
  readonly players: readonly SeedPlayer[];
  readonly matches: readonly SeedMatch[];
  readonly sessions: readonly SeedSession[];
}

export interface SeedParams {
  readonly seed: number;
  /** Today as 'YYYY-MM-DD'. Passed in so the generator never reads a clock. */
  readonly today: string;
}
