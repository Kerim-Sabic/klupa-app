// Generated from the live schema by scripts/db-types.mjs. Do not edit by hand.
import type { Enums } from './enums';

export type MatchTables = {
  match_events: {
    Row: {
      client_id: string;
      clock_seconds: number;
      club_id: string;
      created_at: string;
      created_by: string | null;
      deleted_at: string | null;
      header: boolean;
      id: string;
      kind: Enums['event_kind'];
      match_id: string;
      period: number;
      player_id: string | null;
      side: Enums['event_side'];
      weight: number;
      x: number | null;
      y: number | null;
    };
    Insert: {
      client_id: string;
      clock_seconds: number;
      club_id: string;
      created_at?: string;
      created_by?: string | null;
      deleted_at?: string | null;
      header?: boolean;
      id?: string;
      kind: Enums['event_kind'];
      match_id: string;
      period: number;
      player_id?: string | null;
      side: Enums['event_side'];
      weight: number;
      x?: number | null;
      y?: number | null;
    };
    Update: {
      client_id?: string;
      clock_seconds?: number;
      club_id?: string;
      created_at?: string;
      created_by?: string | null;
      deleted_at?: string | null;
      header?: boolean;
      id?: string;
      kind?: Enums['event_kind'];
      match_id?: string;
      period?: number;
      player_id?: string | null;
      side?: Enums['event_side'];
      weight?: number;
      x?: number | null;
      y?: number | null;
    };
    Relationships: [
      {
        foreignKeyName: 'match_events_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'match_events_club_id_match_id_fkey';
        columns: ['club_id', 'match_id'];
        isOneToOne: false;
        referencedRelation: 'matches';
        referencedColumns: ['club_id', 'id'];
      },
      {
        foreignKeyName: 'match_events_club_id_player_id_fkey';
        columns: ['club_id', 'player_id'];
        isOneToOne: false;
        referencedRelation: 'players';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
  matches: {
    Row: {
      club_id: string;
      created_at: string;
      created_by: string | null;
      id: string;
      opponent: string;
      period_count: number;
      period_minutes: number;
      played_on: string;
      status: Enums['match_status'];
      team_id: string;
      updated_at: string;
    };
    Insert: {
      club_id: string;
      created_at?: string;
      created_by?: string | null;
      id?: string;
      opponent: string;
      period_count?: number;
      period_minutes?: number;
      played_on: string;
      status?: Enums['match_status'];
      team_id: string;
      updated_at?: string;
    };
    Update: {
      club_id?: string;
      created_at?: string;
      created_by?: string | null;
      id?: string;
      opponent?: string;
      period_count?: number;
      period_minutes?: number;
      played_on?: string;
      status?: Enums['match_status'];
      team_id?: string;
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'matches_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'matches_club_id_team_id_fkey';
        columns: ['club_id', 'team_id'];
        isOneToOne: false;
        referencedRelation: 'teams';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
  stints: {
    Row: {
      club_id: string;
      created_at: string;
      id: string;
      match_id: string;
      off_seconds: number | null;
      on_seconds: number;
      period: number;
      player_id: string;
    };
    Insert: {
      club_id: string;
      created_at?: string;
      id?: string;
      match_id: string;
      off_seconds?: number | null;
      on_seconds: number;
      period: number;
      player_id: string;
    };
    Update: {
      club_id?: string;
      created_at?: string;
      id?: string;
      match_id?: string;
      off_seconds?: number | null;
      on_seconds?: number;
      period?: number;
      player_id?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'stints_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'stints_club_id_match_id_fkey';
        columns: ['club_id', 'match_id'];
        isOneToOne: false;
        referencedRelation: 'matches';
        referencedColumns: ['club_id', 'id'];
      },
      {
        foreignKeyName: 'stints_club_id_player_id_fkey';
        columns: ['club_id', 'player_id'];
        isOneToOne: false;
        referencedRelation: 'players';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
};
