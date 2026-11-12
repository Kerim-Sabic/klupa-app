// Generated from the live schema by scripts/db-types.mjs. Do not edit by hand.
import type { Enums } from './enums';

export type ClubTables = {
  audit_log: {
    Row: {
      action: Enums['audit_action'];
      actor_id: string | null;
      changed_columns: string[] | null;
      club_id: string;
      id: number;
      occurred_at: string;
      row_key: string;
      table_name: string;
    };
    Insert: {
      action: Enums['audit_action'];
      actor_id?: string | null;
      changed_columns?: string[] | null;
      club_id: string;
      id?: never;
      occurred_at?: string;
      row_key: string;
      table_name: string;
    };
    Update: {
      action?: Enums['audit_action'];
      actor_id?: string | null;
      changed_columns?: string[] | null;
      club_id?: string;
      id?: never;
      occurred_at?: string;
      row_key?: string;
      table_name?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'audit_log_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
    ];
  };
  client_errors: {
    Row: {
      fingerprint: string;
      id: number;
      message: string;
      name: string;
      occurred_at: string;
      release: string;
      route: string;
      user_id: string | null;
    };
    Insert: {
      fingerprint: string;
      id?: never;
      message: string;
      name: string;
      occurred_at?: string;
      release: string;
      route: string;
      user_id?: string | null;
    };
    Update: {
      fingerprint?: string;
      id?: never;
      message?: string;
      name?: string;
      occurred_at?: string;
      release?: string;
      route?: string;
      user_id?: string | null;
    };
    Relationships: [];
  };
  client_vitals: {
    Row: {
      cls_milli: number | null;
      id: number;
      inp_ms: number | null;
      lcp_ms: number | null;
      occurred_at: string;
      release: string;
      route: string;
    };
    Insert: {
      cls_milli?: number | null;
      id?: never;
      inp_ms?: number | null;
      lcp_ms?: number | null;
      occurred_at?: string;
      release: string;
      route: string;
    };
    Update: {
      cls_milli?: number | null;
      id?: never;
      inp_ms?: number | null;
      lcp_ms?: number | null;
      occurred_at?: string;
      release?: string;
      route?: string;
    };
    Relationships: [];
  };
  club_members: {
    Row: {
      club_id: string;
      created_at: string;
      role: Enums['member_role'];
      user_id: string;
    };
    Insert: {
      club_id: string;
      created_at?: string;
      role: Enums['member_role'];
      user_id: string;
    };
    Update: {
      club_id?: string;
      created_at?: string;
      role?: Enums['member_role'];
      user_id?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'club_members_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
    ];
  };
  clubs: {
    Row: {
      created_at: string;
      created_by: string | null;
      floodlight_kw: number | null;
      grid_kg_co2_per_kwh: number | null;
      id: string;
      is_demo: boolean;
      name: string;
      tariff_per_kwh: number | null;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      created_by?: string | null;
      floodlight_kw?: number | null;
      grid_kg_co2_per_kwh?: number | null;
      id?: string;
      is_demo?: boolean;
      name: string;
      tariff_per_kwh?: number | null;
      updated_at?: string;
    };
    Update: {
      created_at?: string;
      created_by?: string | null;
      floodlight_kw?: number | null;
      grid_kg_co2_per_kwh?: number | null;
      id?: string;
      is_demo?: boolean;
      name?: string;
      tariff_per_kwh?: number | null;
      updated_at?: string;
    };
    Relationships: [];
  };
  data_requests: {
    Row: {
      club_id: string;
      created_at: string;
      id: string;
      kind: Enums['data_request_kind'];
      player_id: string | null;
      requested_by: string | null;
      resolved_at: string | null;
      status: Enums['data_request_status'];
    };
    Insert: {
      club_id: string;
      created_at?: string;
      id?: string;
      kind: Enums['data_request_kind'];
      player_id?: string | null;
      requested_by?: string | null;
      resolved_at?: string | null;
      status?: Enums['data_request_status'];
    };
    Update: {
      club_id?: string;
      created_at?: string;
      id?: string;
      kind?: Enums['data_request_kind'];
      player_id?: string | null;
      requested_by?: string | null;
      resolved_at?: string | null;
      status?: Enums['data_request_status'];
    };
    Relationships: [
      {
        foreignKeyName: 'data_requests_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'data_requests_club_id_player_id_fkey';
        columns: ['club_id', 'player_id'];
        isOneToOne: false;
        referencedRelation: 'players';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
  players: {
    Row: {
      archived_at: string | null;
      birth_quarter: number | null;
      club_id: string;
      consent: Enums['consent_status'];
      consent_recorded_at: string | null;
      created_at: string;
      id: string;
      label: string;
      shirt_number: number;
      team_id: string;
      updated_at: string;
    };
    Insert: {
      archived_at?: string | null;
      birth_quarter?: number | null;
      club_id: string;
      consent?: Enums['consent_status'];
      consent_recorded_at?: string | null;
      created_at?: string;
      id?: string;
      label: string;
      shirt_number: number;
      team_id: string;
      updated_at?: string;
    };
    Update: {
      archived_at?: string | null;
      birth_quarter?: number | null;
      club_id?: string;
      consent?: Enums['consent_status'];
      consent_recorded_at?: string | null;
      created_at?: string;
      id?: string;
      label?: string;
      shirt_number?: number;
      team_id?: string;
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'players_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
      {
        foreignKeyName: 'players_club_id_team_id_fkey';
        columns: ['club_id', 'team_id'];
        isOneToOne: false;
        referencedRelation: 'teams';
        referencedColumns: ['club_id', 'id'];
      },
    ];
  };
  teams: {
    Row: {
      age_group: Enums['age_group'];
      archived_at: string | null;
      club_id: string;
      created_at: string;
      id: string;
      name: string;
      updated_at: string;
    };
    Insert: {
      age_group: Enums['age_group'];
      archived_at?: string | null;
      club_id: string;
      created_at?: string;
      id?: string;
      name: string;
      updated_at?: string;
    };
    Update: {
      age_group?: Enums['age_group'];
      archived_at?: string | null;
      club_id?: string;
      created_at?: string;
      id?: string;
      name?: string;
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: 'teams_club_id_fkey';
        columns: ['club_id'];
        isOneToOne: false;
        referencedRelation: 'clubs';
        referencedColumns: ['id'];
      },
    ];
  };
};
