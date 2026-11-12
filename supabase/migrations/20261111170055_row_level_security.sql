-- Tenant isolation. Row-level security is enabled AND forced on every table,
-- every policy is scoped to signed-in users, and privileges are granted
-- column by column so club_id, id and created_by can never be rewritten.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- Membership checks run as the definer so policies on club_members do not recurse.
create function app.is_member(target_club uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.club_members m
      where m.club_id = target_club and m.user_id = (select auth.uid())
    );
  $$;

create function app.has_role(target_club uuid, allowed public.member_role[]) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.club_members m
      where m.club_id = target_club
        and m.user_id = (select auth.uid())
        and m.role = any (allowed)
    );
  $$;

create function app.is_owner(target_club uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select app.has_role(target_club, array['owner']::public.member_role[]); $$;

-- Owners and coaches manage rosters, plans and deletions.
create function app.can_manage(target_club uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select app.has_role(target_club, array['owner', 'coach']::public.member_role[]); $$;

-- Assistants may also record what happens on the pitch.
create function app.can_record(target_club uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select app.has_role(target_club, array['owner', 'coach', 'assistant']::public.member_role[]);
  $$;

revoke all on function app.is_member(uuid) from public;
revoke all on function app.has_role(uuid, public.member_role[]) from public;
revoke all on function app.is_owner(uuid) from public;
revoke all on function app.can_manage(uuid) from public;
revoke all on function app.can_record(uuid) from public;
grant execute on function app.is_member(uuid) to authenticated;
grant execute on function app.has_role(uuid, public.member_role[]) to authenticated;
grant execute on function app.is_owner(uuid) to authenticated;
grant execute on function app.can_manage(uuid) to authenticated;
grant execute on function app.can_record(uuid) to authenticated;

alter table public.clubs enable row level security;
alter table public.clubs force row level security;
alter table public.club_members enable row level security;
alter table public.club_members force row level security;
alter table public.teams enable row level security;
alter table public.teams force row level security;
alter table public.players enable row level security;
alter table public.players force row level security;
alter table public.matches enable row level security;
alter table public.matches force row level security;
alter table public.match_events enable row level security;
alter table public.match_events force row level security;
alter table public.stints enable row level security;
alter table public.stints force row level security;
alter table public.sessions enable row level security;
alter table public.sessions force row level security;
alter table public.session_drills enable row level security;
alter table public.session_drills force row level security;
alter table public.session_attendance enable row level security;
alter table public.session_attendance force row level security;
alter table public.observations enable row level security;
alter table public.observations force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.data_requests enable row level security;
alter table public.data_requests force row level security;

-- clubs: created only through create_club(); no insert policy on purpose.
create policy clubs_select on public.clubs for select to authenticated
  using (app.is_member(id));
create policy clubs_update on public.clubs for update to authenticated
  using (app.is_owner(id)) with check (app.is_owner(id));
create policy clubs_delete on public.clubs for delete to authenticated
  using (app.is_owner(id));

create policy club_members_select on public.club_members for select to authenticated
  using (app.is_member(club_id));
create policy club_members_insert on public.club_members for insert to authenticated
  with check (app.is_owner(club_id));
create policy club_members_update on public.club_members for update to authenticated
  using (app.is_owner(club_id)) with check (app.is_owner(club_id));
create policy club_members_delete on public.club_members for delete to authenticated
  using (app.is_owner(club_id) or user_id = (select auth.uid()));

create policy teams_select on public.teams for select to authenticated
  using (app.is_member(club_id));
create policy teams_insert on public.teams for insert to authenticated
  with check (app.can_manage(club_id));
create policy teams_update on public.teams for update to authenticated
  using (app.can_manage(club_id)) with check (app.can_manage(club_id));
create policy teams_delete on public.teams for delete to authenticated
  using (app.can_manage(club_id));

create policy players_select on public.players for select to authenticated
  using (app.is_member(club_id));
create policy players_insert on public.players for insert to authenticated
  with check (app.can_manage(club_id));
create policy players_update on public.players for update to authenticated
  using (app.can_manage(club_id)) with check (app.can_manage(club_id));
create policy players_delete on public.players for delete to authenticated
  using (app.can_manage(club_id));

create policy matches_select on public.matches for select to authenticated
  using (app.is_member(club_id));
create policy matches_insert on public.matches for insert to authenticated
  with check (app.can_record(club_id));
create policy matches_update on public.matches for update to authenticated
  using (app.can_record(club_id)) with check (app.can_record(club_id));
create policy matches_delete on public.matches for delete to authenticated
  using (app.can_manage(club_id));

-- match_events: no delete policy. An undo sets deleted_at; the retention job purges later.
create policy match_events_select on public.match_events for select to authenticated
  using (app.is_member(club_id));
create policy match_events_insert on public.match_events for insert to authenticated
  with check (app.can_record(club_id) and created_by = (select auth.uid()));
create policy match_events_update on public.match_events for update to authenticated
  using (app.can_record(club_id)) with check (app.can_record(club_id));

create policy stints_select on public.stints for select to authenticated
  using (app.is_member(club_id));
create policy stints_insert on public.stints for insert to authenticated
  with check (app.can_record(club_id));
create policy stints_update on public.stints for update to authenticated
  using (app.can_record(club_id)) with check (app.can_record(club_id));
create policy stints_delete on public.stints for delete to authenticated
  using (app.can_record(club_id));

create policy sessions_select on public.sessions for select to authenticated
  using (app.is_member(club_id));
create policy sessions_insert on public.sessions for insert to authenticated
  with check (app.can_manage(club_id));
create policy sessions_update on public.sessions for update to authenticated
  using (app.can_manage(club_id)) with check (app.can_manage(club_id));
create policy sessions_delete on public.sessions for delete to authenticated
  using (app.can_manage(club_id));

create policy session_drills_select on public.session_drills for select to authenticated
  using (app.is_member(club_id));
create policy session_drills_insert on public.session_drills for insert to authenticated
  with check (app.can_manage(club_id));
create policy session_drills_update on public.session_drills for update to authenticated
  using (app.can_manage(club_id)) with check (app.can_manage(club_id));
create policy session_drills_delete on public.session_drills for delete to authenticated
  using (app.can_manage(club_id));

create policy session_attendance_select on public.session_attendance for select to authenticated
  using (app.is_member(club_id));
create policy session_attendance_insert on public.session_attendance for insert to authenticated
  with check (app.can_record(club_id));
create policy session_attendance_update on public.session_attendance for update to authenticated
  using (app.can_record(club_id)) with check (app.can_record(club_id));
create policy session_attendance_delete on public.session_attendance for delete to authenticated
  using (app.can_manage(club_id));

create policy observations_select on public.observations for select to authenticated
  using (app.is_member(club_id));
create policy observations_insert on public.observations for insert to authenticated
  with check (app.can_record(club_id));
create policy observations_update on public.observations for update to authenticated
  using (app.can_record(club_id)) with check (app.can_record(club_id));
create policy observations_delete on public.observations for delete to authenticated
  using (app.can_manage(club_id));

-- audit_log: readable by those who manage the club; written only by triggers.
create policy audit_log_select on public.audit_log for select to authenticated
  using (app.can_manage(club_id));

create policy data_requests_select on public.data_requests for select to authenticated
  using (app.is_owner(club_id) or requested_by = (select auth.uid()));
create policy data_requests_insert on public.data_requests for insert to authenticated
  with check (app.is_member(club_id) and requested_by = (select auth.uid()));
create policy data_requests_update on public.data_requests for update to authenticated
  using (app.is_owner(club_id)) with check (app.is_owner(club_id));

-- Privileges: nothing for signed-out visitors, and only the columns a role may change.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;

grant select, delete on public.clubs to authenticated;
grant update (name, floodlight_kw, tariff_per_kwh, grid_kg_co2_per_kwh)
  on public.clubs to authenticated;

grant select, insert, delete on public.club_members to authenticated;
grant update (role) on public.club_members to authenticated;

grant select, insert, delete on public.teams to authenticated;
grant update (name, age_group, archived_at) on public.teams to authenticated;

grant select, insert, delete on public.players to authenticated;
grant update (label, shirt_number, consent, consent_recorded_at, archived_at)
  on public.players to authenticated;

grant select, insert, delete on public.matches to authenticated;
grant update (opponent, played_on, status, period_count, period_minutes)
  on public.matches to authenticated;

grant select, insert on public.match_events to authenticated;
grant update (deleted_at) on public.match_events to authenticated;

grant select, insert, delete on public.stints to authenticated;
grant update (off_seconds) on public.stints to authenticated;

grant select, insert, delete on public.sessions to authenticated;
grant update (held_on, status, focus, duration_minutes, area, expected_players, floodlit,
  source_match_id) on public.sessions to authenticated;

grant select, insert, delete on public.session_drills to authenticated;
grant update (position, drill_key, minutes) on public.session_drills to authenticated;

grant select, insert, delete on public.session_attendance to authenticated;
grant update (status, minutes, rpe) on public.session_attendance to authenticated;

grant select, insert, delete on public.observations to authenticated;
grant update (attempts, successes) on public.observations to authenticated;

grant select on public.audit_log to authenticated;

grant select, insert on public.data_requests to authenticated;
grant update (status, resolved_at) on public.data_requests to authenticated;
