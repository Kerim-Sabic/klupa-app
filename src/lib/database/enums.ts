// Generated from the live schema by scripts/db-types.mjs. Do not edit by hand.

export type Enums = {
  age_group: 'u7' | 'u9' | 'u11' | 'u13' | 'u15' | 'u17' | 'u19' | 'senior';
  attendance_status: 'expected' | 'present' | 'absent';
  audit_action: 'insert' | 'update' | 'delete';
  consent_status: 'not_recorded' | 'granted' | 'withdrawn';
  data_request_kind: 'export' | 'erasure';
  data_request_status: 'open' | 'completed' | 'rejected';
  event_kind:
    | 'goal'
    | 'shot_on_target'
    | 'shot_off_target'
    | 'big_chance'
    | 'box_entry'
    | 'corner'
    | 'high_recovery'
    | 'lost_ball_own_half';
  event_side: 'home' | 'away';
  match_status: 'scheduled' | 'live' | 'finished';
  member_role: 'owner' | 'coach' | 'assistant' | 'viewer';
  pitch_area: 'quarter' | 'half' | 'full';
  session_status: 'planned' | 'completed' | 'cancelled';
};
