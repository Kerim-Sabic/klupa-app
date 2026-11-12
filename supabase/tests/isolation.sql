-- Tenant isolation and integrity test. Two users, two clubs, one signed-out visitor.
-- Runs inside a transaction and rolls back, so it is safe against any database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/isolation.sql
-- It raises an exception (non-zero exit) listing every failed check.

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  c1 uuid; c2 uuid; t1 uuid; p1 uuid; m1 uuid; e1 uuid;
  n integer;
  passed integer := 0;
  failures text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'rls-a@test.invalid', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'rls-b@test.invalid', now(), now());

  -- ===== user 1 builds club A =====
  perform set_config('request.jwt.claims',
    json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c1 := public.create_club('Club A');
  insert into public.teams (club_id, name, age_group) values (c1, 'U13', 'u13')
    returning id into t1;
  insert into public.players (club_id, team_id, label, shirt_number) values (c1, t1, 'Soko', 7)
    returning id into p1;
  insert into public.matches (club_id, team_id, opponent, played_on)
    values (c1, t1, 'Rival', current_date) returning id into m1;

  begin
    insert into public.match_events
      (club_id, match_id, client_id, period, clock_seconds, side, kind, weight, created_by)
    values (c1, m1, gen_random_uuid(), 1, 10, 'home', 'shot_on_target', 3, u1);
    failures := array_append(failures, 'event accepted on a scheduled match');
  exception when check_violation then passed := passed + 1; end;

  update public.matches set status = 'live' where id = m1;
  insert into public.match_events
    (club_id, match_id, client_id, period, clock_seconds, side, kind, weight, player_id, created_by)
  values (c1, m1, gen_random_uuid(), 1, 10, 'home', 'shot_on_target', 3, p1, u1)
  returning id into e1;
  passed := passed + 1;

  begin
    update public.matches set status = 'scheduled' where id = m1;
    failures := array_append(failures, 'illegal status transition live -> scheduled accepted');
  exception when check_violation then passed := passed + 1; end;

  begin
    insert into public.match_events
      (club_id, match_id, client_id, period, clock_seconds, side, kind, weight, created_by)
    values (c1, m1, gen_random_uuid(), 3, 10, 'home', 'corner', 1, u1);
    failures := array_append(failures, 'event accepted for a period the match does not have');
  exception when check_violation then passed := passed + 1; end;

  begin
    insert into public.match_events
      (club_id, match_id, client_id, period, clock_seconds, side, kind, weight, created_by)
    values (c1, m1, gen_random_uuid(), 1, 20, 'home', 'corner', 1, u2);
    failures := array_append(failures, 'event accepted with a forged author');
  exception when insufficient_privilege then passed := passed + 1; end;

  -- ===== user 2 builds club B and attacks club A =====
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c2 := public.create_club('Club B');

  select count(*) into n from public.clubs;
  if n = 1 then passed := passed + 1;
  else failures := failures || format('user 2 sees %s clubs', n); end if;
  select count(*) into n from public.players;
  if n = 0 then passed := passed + 1;
  else failures := failures || format('user 2 reads %s foreign players', n); end if;
  select count(*) into n from public.match_events;
  if n = 0 then passed := passed + 1;
  else failures := failures || format('user 2 reads %s foreign events', n); end if;
  select count(*) into n from public.audit_log where club_id = c1;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'user 2 reads foreign audit log'); end if;

  update public.players set label = 'hacked' where id = p1;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'user 2 updated a foreign player'); end if;
  delete from public.matches where id = m1;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'user 2 deleted a foreign match'); end if;

  begin
    insert into public.teams (club_id, name, age_group) values (c1, 'Intruders', 'u9');
    failures := array_append(failures, 'cross-tenant insert accepted');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    insert into public.players (club_id, team_id, label, shirt_number)
      values (c2, t1, 'Borrowed', 9);
    failures := array_append(failures, 'row in club B allowed to reference a team of club A');
  exception when foreign_key_violation then passed := passed + 1; end;

  begin
    insert into public.clubs (name) values ('Direct insert');
    failures := array_append(failures, 'club created without create_club()');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    update public.clubs set is_demo = true where id = c2;
    failures := array_append(failures, 'protected column is_demo was writable');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    perform public.export_club_data(c1);
    failures := array_append(failures, 'user 2 exported club A');
  exception when insufficient_privilege then passed := passed + 1; end;

  if (public.export_club_data(c2) -> 'club' ->> 'name') = 'Club B' then passed := passed + 1;
  else failures := array_append(failures, 'owner could not export own club'); end if;

  -- ===== signed-out visitor =====
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    select count(*) into n from public.clubs;
    failures := array_append(failures, 'anonymous visitor can query clubs');
  exception when insufficient_privilege then passed := passed + 1; end;
  begin
    perform public.create_club('Anon club');
    failures := array_append(failures, 'anonymous visitor can call create_club');
  exception when insufficient_privilege then passed := passed + 1; end;
  if public.health() ->> 'status' = 'ok' then passed := passed + 1;
  else failures := array_append(failures, 'health probe unavailable to visitors'); end if;

  -- ===== back to user 1: audit trail, append-only, owner rules, erasure =====
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.audit_log where club_id = c1;
  if n >= 6 then passed := passed + 1;
  else failures := failures || format('expected >= 6 audit rows, found %s', n); end if;
  select count(*) into n from public.audit_log
  where club_id = c1 and table_name = 'matches' and action = 'update'
    and changed_columns = array['status'];
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'status change not audited with its column name'); end if;

  begin
    update public.audit_log set table_name = 'tampered' where club_id = c1;
    failures := array_append(failures, 'audit log was updatable');
  exception when insufficient_privilege then passed := passed + 1; end;
  begin
    delete from public.audit_log where club_id = c1;
    failures := array_append(failures, 'audit log was deletable');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    delete from public.match_events where id = e1;
    failures := array_append(failures, 'event hard delete accepted');
  exception when insufficient_privilege then passed := passed + 1; end;
  update public.match_events set deleted_at = now() where id = e1;
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'soft delete (undo) failed'); end if;

  begin
    delete from public.club_members where club_id = c1 and user_id = u1;
    failures := array_append(failures, 'last owner was able to leave');
  exception when check_violation then passed := passed + 1; end;

  delete from public.players where id = p1;
  select count(*) into n from public.match_events
  where id = e1 and player_id is null and club_id = c1;
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'erasing a player did not detach their events cleanly'); end if;

  delete from public.clubs where id = c1;
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'owner could not delete own club'); end if;

  reset role;
  select count(*) into n from public.audit_log where club_id = c1;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'audit rows survived club erasure'); end if;

  if cardinality(failures) > 0 then
    raise exception 'isolation test FAILED: %', array_to_string(failures, ' | ');
  end if;
  raise notice 'isolation test passed: % checks', passed;
end $$;

rollback;
