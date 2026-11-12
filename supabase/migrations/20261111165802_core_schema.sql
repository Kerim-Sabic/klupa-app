-- Klupa core schema.
-- Every tenant table carries club_id and points to its parent through a
-- composite (club_id, id) key, so a row can never point into another club.

create type public.member_role as enum ('owner', 'coach', 'assistant', 'viewer');
create type public.age_group as enum ('u7', 'u9', 'u11', 'u13', 'u15', 'u17', 'u19', 'senior');
create type public.consent_status as enum ('not_recorded', 'granted', 'withdrawn');
create type public.match_status as enum ('scheduled', 'live', 'finished');
create type public.event_side as enum ('home', 'away');
create type public.event_kind as enum (
  'goal', 'shot_on_target', 'shot_off_target', 'big_chance',
  'box_entry', 'corner', 'high_recovery', 'lost_ball_own_half'
);
create type public.pitch_area as enum ('quarter', 'half', 'full');
create type public.session_status as enum ('planned', 'completed', 'cancelled');
create type public.attendance_status as enum ('expected', 'present', 'absent');
create type public.audit_action as enum ('insert', 'update', 'delete');
create type public.data_request_kind as enum ('export', 'erasure');
create type public.data_request_status as enum ('open', 'completed', 'rejected');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  -- Optional factors a club types in for facility estimates. Money and energy are exact decimals.
  floodlight_kw numeric(6, 2) check (floodlight_kw >= 0),
  tariff_per_kwh numeric(8, 4) check (tariff_per_kwh >= 0),
  grid_kg_co2_per_kwh numeric(6, 4) check (grid_kg_co2_per_kwh >= 0),
  is_demo boolean not null default false,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clubs_created_by_idx on public.clubs (created_by);

create table public.club_members (
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  user_id uuid not null REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_id_idx on public.club_members (user_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  age_group public.age_group not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id)
);

-- A player is a label and a shirt number. No real name, birth date or photo is stored.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  team_id uuid not null, -- REFERENCES teams (club_id, id) ON DELETE CASCADE, paired with club_id
  label text not null check (char_length(btrim(label)) between 1 and 40),
  shirt_number smallint not null check (shirt_number between 1 and 99),
  consent public.consent_status not null default 'not_recorded',
  consent_recorded_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  FOREIGN KEY (club_id, team_id) REFERENCES public.teams (club_id, id) ON DELETE CASCADE,
  check ((consent = 'not_recorded') = (consent_recorded_at is null))
);
create index players_club_team_idx on public.players (club_id, team_id);
create unique index players_team_shirt_active_idx
  on public.players (team_id, shirt_number) where archived_at is null;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  team_id uuid not null, -- REFERENCES teams (club_id, id) ON DELETE CASCADE, paired with club_id
  opponent text not null check (char_length(btrim(opponent)) between 1 and 60),
  played_on date not null,
  status public.match_status not null default 'scheduled',
  period_count smallint not null default 2 check (period_count between 1 and 4),
  period_minutes smallint not null default 30 check (period_minutes between 5 and 60),
  created_by uuid default auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  FOREIGN KEY (club_id, team_id) REFERENCES public.teams (club_id, id) ON DELETE CASCADE
);
create index matches_club_team_date_idx on public.matches (club_id, team_id, played_on desc);
create index matches_created_by_idx on public.matches (created_by);

-- Tagged match evidence. Rows are soft-deleted (deleted_at) so an undo is itself auditable;
-- client_id makes a retried offline upload idempotent.
create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  match_id uuid not null, -- REFERENCES matches (club_id, id) ON DELETE CASCADE, paired with club_id
  client_id uuid not null, -- minted on the phone; REFERENCES no row, so no ON DELETE rule
  period smallint not null check (period between 1 and 4),
  clock_seconds integer not null check (clock_seconds between 0 and 7200),
  side public.event_side not null,
  kind public.event_kind not null,
  weight smallint not null check (weight between 0 and 100),
  player_id uuid, -- REFERENCES players (club_id, id) ON DELETE SET NULL, paired with club_id
  created_by uuid default auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (match_id, client_id),
  FOREIGN KEY (club_id, match_id) REFERENCES public.matches (club_id, id) ON DELETE CASCADE,
  FOREIGN KEY (club_id, player_id) REFERENCES public.players (club_id, id) ON DELETE SET NULL (player_id)
);
create index match_events_match_clock_idx
  on public.match_events (club_id, match_id, period, clock_seconds) where deleted_at is null;
create index match_events_player_idx on public.match_events (club_id, player_id);
create index match_events_author_time_idx on public.match_events (created_by, created_at);

-- Who was on the pitch, and when. Minutes are derived from these, never typed in.
create table public.stints (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  match_id uuid not null, -- REFERENCES matches (club_id, id) ON DELETE CASCADE, paired with club_id
  player_id uuid not null, -- REFERENCES players (club_id, id) ON DELETE CASCADE, paired with club_id
  period smallint not null check (period between 1 and 4),
  on_seconds integer not null check (on_seconds between 0 and 7200),
  off_seconds integer check (off_seconds between 0 and 7200),
  created_at timestamptz not null default now(),
  check (off_seconds is null or off_seconds > on_seconds),
  FOREIGN KEY (club_id, match_id) REFERENCES public.matches (club_id, id) ON DELETE CASCADE,
  FOREIGN KEY (club_id, player_id) REFERENCES public.players (club_id, id) ON DELETE CASCADE
);
create index stints_match_idx on public.stints (club_id, match_id);
create index stints_player_idx on public.stints (club_id, player_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  team_id uuid not null, -- REFERENCES teams (club_id, id) ON DELETE CASCADE, paired with club_id
  held_on date not null,
  status public.session_status not null default 'planned',
  focus text not null check (focus ~ '^[a-z0-9_]{2,40}$'),
  duration_minutes smallint not null check (duration_minutes between 10 and 180),
  area public.pitch_area not null,
  expected_players smallint not null check (expected_players between 1 and 40),
  floodlit boolean not null default false,
  source_match_id uuid, -- REFERENCES matches (club_id, id) ON DELETE SET NULL, paired with club_id
  created_by uuid default auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  FOREIGN KEY (club_id, team_id) REFERENCES public.teams (club_id, id) ON DELETE CASCADE,
  FOREIGN KEY (club_id, source_match_id) REFERENCES public.matches (club_id, id) ON DELETE SET NULL (source_match_id)
);
create index sessions_club_team_date_idx on public.sessions (club_id, team_id, held_on desc);
create index sessions_source_match_idx on public.sessions (club_id, source_match_id);
create index sessions_created_by_idx on public.sessions (created_by);

create table public.session_drills (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  session_id uuid not null, -- REFERENCES sessions (club_id, id) ON DELETE CASCADE, paired with club_id
  position smallint not null check (position between 1 and 12),
  drill_key text not null check (drill_key ~ '^[a-z0-9-]{2,64}$'),
  minutes smallint not null check (minutes between 1 and 120),
  unique (session_id, position),
  FOREIGN KEY (club_id, session_id) REFERENCES public.sessions (club_id, id) ON DELETE CASCADE
);
create index session_drills_session_idx on public.session_drills (club_id, session_id);

-- Attendance carries the effort rating (1-10) used for responsible load monitoring.
create table public.session_attendance (
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  session_id uuid not null, -- REFERENCES sessions (club_id, id) ON DELETE CASCADE, paired with club_id
  player_id uuid not null, -- REFERENCES players (club_id, id) ON DELETE CASCADE, paired with club_id
  status public.attendance_status not null default 'expected',
  minutes smallint check (minutes between 0 and 180),
  rpe smallint check (rpe between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id),
  FOREIGN KEY (club_id, session_id) REFERENCES public.sessions (club_id, id) ON DELETE CASCADE,
  FOREIGN KEY (club_id, player_id) REFERENCES public.players (club_id, id) ON DELETE CASCADE
);
create index session_attendance_session_idx on public.session_attendance (club_id, session_id);
create index session_attendance_player_idx on public.session_attendance (club_id, player_id);

-- What a coach actually saw: attempts and successes per player, per skill, per session.
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  session_id uuid not null, -- REFERENCES sessions (club_id, id) ON DELETE CASCADE, paired with club_id
  player_id uuid not null, -- REFERENCES players (club_id, id) ON DELETE CASCADE, paired with club_id
  skill text not null check (skill ~ '^[a-z0-9_]{2,40}$'),
  attempts smallint not null check (attempts between 0 and 500),
  successes smallint not null check (successes >= 0),
  created_by uuid default auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (successes <= attempts),
  unique (session_id, player_id, skill),
  FOREIGN KEY (club_id, session_id) REFERENCES public.sessions (club_id, id) ON DELETE CASCADE,
  FOREIGN KEY (club_id, player_id) REFERENCES public.players (club_id, id) ON DELETE CASCADE
);
create index observations_session_idx on public.observations (club_id, session_id);
create index observations_player_idx on public.observations (club_id, player_id);
create index observations_created_by_idx on public.observations (created_by);

-- Append-only record of who changed what. It stores column names, never values,
-- so the trail itself holds no personal data. actor_id has no foreign key on
-- purpose: the record must outlive the account.
create table public.audit_log (
  id bigint generated always as identity primary key,
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  actor_id uuid, -- REFERENCES no user, no ON DELETE rule: the trail outlives the account
  action public.audit_action not null,
  table_name text not null,
  row_key text not null,
  changed_columns text[],
  occurred_at timestamptz not null default now()
);
create index audit_log_club_time_idx on public.audit_log (club_id, occurred_at desc);

-- Requests from a club to export or erase data, so every request has a dated answer.
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null REFERENCES public.clubs (id) ON DELETE CASCADE,
  requested_by uuid default auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  kind public.data_request_kind not null,
  status public.data_request_status not null default 'open',
  player_id uuid, -- REFERENCES players (club_id, id) ON DELETE SET NULL, paired with club_id
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'open') = (resolved_at is null)),
  FOREIGN KEY (club_id, player_id) REFERENCES public.players (club_id, id) ON DELETE SET NULL (player_id)
);
create index data_requests_club_idx on public.data_requests (club_id, created_at desc);
create index data_requests_player_idx on public.data_requests (club_id, player_id);
create index data_requests_requested_by_idx on public.data_requests (requested_by);
