// Generated from the live schema by scripts/db-types.mjs. Do not edit by hand.
import type { Enums } from './enums';
import type { Json } from './json';

export type Functions = {
  apply_lineup: {
    Args: { changes: Json; target_club: string; target_match: string };
    Returns: number;
  };
  create_club: {
    Args: {
      club_name: string;
      demo?: boolean;
      team_age?: Enums['age_group'];
      team_name?: string;
    };
    Returns: string;
  };
  delete_club: { Args: { target_club: string }; Returns: undefined };
  erase_player: {
    Args: { target_club: string; target_player: string };
    Returns: undefined;
  };
  export_club_data: { Args: { target_club: string }; Returns: Json };
  field_pulse: { Args: never; Returns: Json };
  health: { Args: never; Returns: Json };
  import_season: {
    Args: { season: Json; target_club: string; target_team: string };
    Returns: Json;
  };
  plan_session: {
    Args: { plan: Json; target_club: string; target_team: string };
    Returns: string;
  };
  report_client_error: {
    Args: {
      app_release: string;
      error_fingerprint: string;
      error_message: string;
      error_name: string;
      error_route: string;
    };
    Returns: undefined;
  };
  report_vitals: {
    Args: {
      app_release: string;
      cls?: number;
      inp?: number;
      lcp?: number;
      page_route: string;
    };
    Returns: undefined;
  };
  record_attendance: {
    Args: {
      new_minutes?: number;
      new_rpe?: number;
      new_status: Enums['attendance_status'];
      target_club: string;
      target_player: string;
      target_session: string;
    };
    Returns: undefined;
  };
  record_observation: {
    Args: {
      new_attempts: number;
      new_successes: number;
      skill_key: string;
      target_club: string;
      target_player: string;
      target_session: string;
    };
    Returns: undefined;
  };
};
