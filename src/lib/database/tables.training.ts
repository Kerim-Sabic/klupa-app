// Generated from the live schema by scripts/db-types.mjs. Do not edit by hand.
import type { Enums } from './enums';

export type TrainingTables = {
  observations: {
    Row: {
      attempts: number;
      club_id: string;
      created_at: string;
      created_by: string | null;
      id: string;
      player_id: string;
      session_id: string;
      skill: string;
      successes: number;
      updated_at: string;
    };
    Insert: {
      attempts: number;
      club_id: string;
      created_at?: string;
      created_by?: string | null;
      id?: string;
      player_id: string;
      session_id: string;
      skill: string;
      successes: number;
      updated_at?: string;
    };
    Update: {
      attempts?: number;
      club_id?: string;
      created_at?: string;
      created_by?: string | null;
      id?: string;
      player_id?: string;
      session_id?: string;
      skill?: string;
      successes?: number;
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'observations_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'observations_club_id_player_id_fkey';
        columns: ['club_id', 'player_id'];
        isOneToOne: false;
        referencedRelation: 'players';
        referencedColumns: ['club_id', 'id'];
      },
      {
        foreignKeyName: 'observations_club_id_session_id_fkey';
        columns: ['club_id', 'session_id'];
        isOneToOne: false;
        referencedRelation: 'sessions';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
  session_attendance: {
    Row: {
      club_id: string;
      minutes: number | null;
      player_id: string;
      rpe: number | null;
      session_id: string;
      status: Enums['attendance_status'];
      updated_at: string;
    };
    Insert: {
      club_id: string;
      minutes?: number | null;
      player_id: string;
      rpe?: number | null;
      session_id: string;
      status?: Enums['attendance_status'];
      updated_at?: string;
    };
    Update: {
      club_id?: string;
      minutes?: number | null;
      player_id?: string;
      rpe?: number | null;
      session_id?: string;
      status?: Enums['attendance_status'];
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'session_attendance_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'session_attendance_club_id_player_id_fkey';
        columns: ['club_id', 'player_id'];
        isOneToOne: false;
        referencedRelation: 'players';
        referencedColumns: ['club_id', 'id'];
      },
      {
        foreignKeyName: 'session_attendance_club_id_session_id_fkey';
        columns: ['club_id', 'session_id'];
        isOneToOne: false;
        referencedRelation: 'sessions';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
  session_drills: {
    Row: {
      club_id: string;
      drill_key: string;
      id: string;
      minutes: number;
      position: number;
      session_id: string;
    };
    Insert: {
      club_id: string;
      drill_key: string;
      id?: string;
      minutes: number;
      position: number;
      session_id: string;
    };
    Update: {
      club_id?: string;
      drill_key?: string;
      id?: string;
      minutes?: number;
      position?: number;
      session_id?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'session_drills_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'session_drills_club_id_session_id_fkey';
        columns: ['club_id', 'session_id'];
        isOneToOne: false;
        referencedRelation: 'sessions';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
  sessions: {
    Row: {
      area: Enums['pitch_area'];
      club_id: string;
      created_at: string;
      created_by: string | null;
      duration_minutes: number;
      expected_players: number;
      floodlit: boolean;
      focus: string;
      held_on: string;
      id: string;
      source_match_id: string | null;
      status: Enums['session_status'];
      team_id: string;
      updated_at: string;
    };
    Insert: {
      area: Enums['pitch_area'];
      club_id: string;
      created_at?: string;
      created_by?: string | null;
      duration_minutes: number;
      expected_players: number;
      floodlit?: boolean;
      focus: string;
      held_on: string;
      id?: string;
      source_match_id?: string | null;
      status?: Enums['session_status'];
      team_id: string;
      updated_at?: string;
    };
    Update: {
      area?: Enums['pitch_area'];
      club_id?: string;
      created_at?: string;
      created_by?: string | null;
      duration_minutes?: number;
      expected_players?: number;
      floodlit?: boolean;
      focus?: string;
      held_on?: string;
      id?: string;
      source_match_id?: string | null;
      status?: Enums['session_status'];
      team_id?: string;
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'sessions_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'sessions_club_id_source_match_id_fkey';
        columns: ['club_id', 'source_match_id'];
        isOneToOne: false;
        referencedRelation: 'matches';
        referencedColumns: ['club_id', 'id'];
      },
      {
        foreignKeyName: 'sessions_club_id_team_id_fkey';
        columns: ['club_id', 'team_id'];
        isOneToOne: false;
        referencedRelation: 'teams';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
};
