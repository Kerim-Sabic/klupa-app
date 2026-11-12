-- The functions that store several rows at once: each is all-or-nothing, and each obeys the
-- same tenant rules as a single write. Two users, two clubs, one signed-out visitor.
-- Runs inside a transaction and rolls back, so it is safe against any database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/atomic_writes.sql
-- It raises an exception (non-zero exit) listing every failed check.

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  c1 uuid; c2 uuid; t1 uuid; p1 uuid; p2 uuid; m1 uuid; s1 uuid; st1 uuid;
  n integer;
  summary jsonb;
  season jsonb;
  passed integer := 0;
  failures text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'atomic-a@test.invalid', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'atomic-b@test.invalid', now(), now());

  -- ===== user 1 builds club A =====
  perform set_config('request.jwt.claims',
    json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c1 := public.create_club('Club A');
  insert into public.teams (club_id, name, age_group) values (c1, 'U13', 'u13')
    returning id into t1;
  insert into public.players (club_id, team_id, label, shirt_number) values (c1, t1, 'Soko', 7)
    returning id into p1;
  insert into public.players (club_id, team_id, label, shirt_number) values (c1, t1, 'Lav', 9)
    returning id into p2;
  insert into public.matches (club_id, team_id, opponent, played_on)
    values (c1, t1, 'Rival', current_date) returning id into m1;

  -- ----- plan_session: the session, its drills and the expected players, together -----
  s1 := public.plan_session(c1, t1, jsonb_build_object(
    'session', jsonb_build_object('held_on', current_date, 'focus', 'finishing',
      'duration_minutes', 60, 'area', 'half', 'expected_players', 2, 'floodlit', false,
      'source_match_id', m1),
    'drills', jsonb_build_array(
      jsonb_build_object('position', 1, 'drill_key', 'rondo-4v2', 'minutes', 15),
      jsonb_build_object('position', 2, 'drill_key', 'finishing-gates', 'minutes', 20)),
    'player_ids', jsonb_build_array(p1, p2)));
  select (select count(*) from public.session_drills where session_id = s1)
    + (select count(*) from public.session_attendance where session_id = s1 and status = 'expected')
    into n;
  if n = 4 then passed := passed + 1;
  else failures := array_append(failures, format('plan_session stored %s child rows, not 4', n)); end if;

  begin
    perform public.plan_session(c1, t1, jsonb_build_object(
      'session', jsonb_build_object('held_on', current_date, 'focus', 'pressing',
        'duration_minutes', 60, 'area', 'half', 'expected_players', 2, 'floodlit', false),
      'drills', jsonb_build_array(
        jsonb_build_object('position', 1, 'drill_key', 'rondo-4v2', 'minutes', 15),
        jsonb_build_object('position', 2, 'drill_key', 'broken', 'minutes', 0)),
      'player_ids', jsonb_build_array(p1)));
    failures := array_append(failures, 'plan_session accepted a drill of zero minutes');
  exception when check_violation then passed := passed + 1; end;
  select count(*) into n from public.sessions where club_id = c1 and focus = 'pressing';
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'a failed plan_session left a session behind'); end if;

  -- ----- record_attendance / record_observation: store, then correct, never duplicate -----
  perform public.record_attendance(c1, s1, p1, 'present', 60::smallint, 7::smallint);
  perform public.record_attendance(c1, s1, p1, 'present', 45::smallint, 6::smallint);
  select count(*) into n from public.session_attendance
  where session_id = s1 and player_id = p1 and minutes = 45 and rpe = 6;
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'record_attendance did not correct the row'); end if;
  perform public.record_attendance(c1, s1, p1, 'absent');
  select count(*) into n from public.session_attendance
  where session_id = s1 and player_id = p1 and status = 'absent' and minutes is null;
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'record_attendance kept minutes for an absence'); end if;

  perform public.record_observation(c1, s1, p1, 'finishing', 10::smallint, 4::smallint);
  perform public.record_observation(c1, s1, p1, 'finishing', 12::smallint, 5::smallint);
  select count(*) into n from public.observations
  where session_id = s1 and player_id = p1 and skill = 'finishing';
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, format('record_observation left %s rows, not 1', n)); end if;
  begin
    perform public.record_observation(c1, s1, p1, 'finishing', 3::smallint, 9::smallint);
    failures := array_append(failures, 'more successes than attempts accepted');
  exception when check_violation then passed := passed + 1; end;

  -- ----- apply_lineup: a substitution is both halves, or neither -----
  update public.matches set status = 'live' where id = m1;
  n := public.apply_lineup(c1, m1, jsonb_build_array(
    jsonb_build_object('type', 'on', 'player', p1, 'period', 1, 'on_seconds', 0)));
  select id into st1 from public.stints where match_id = m1 and player_id = p1;
  n := public.apply_lineup(c1, m1, jsonb_build_array(
    jsonb_build_object('type', 'off', 'stint', st1, 'off_seconds', 600),
    jsonb_build_object('type', 'on', 'player', p2, 'period', 1, 'on_seconds', 600)));
  select count(*) into n from public.stints where match_id = m1;
  if n = 2 then passed := passed + 1;
  else failures := array_append(failures, format('substitution left %s stints, not 2', n)); end if;

  begin
    perform public.apply_lineup(c1, m1, jsonb_build_array(
      jsonb_build_object('type', 'on', 'player', p1, 'period', 2, 'on_seconds', 0),
      jsonb_build_object('type', 'off', 'stint', gen_random_uuid(), 'off_seconds', 900)));
    failures := array_append(failures, 'apply_lineup accepted a stint that does not exist');
  exception when insufficient_privilege then passed := passed + 1; end;
  select count(*) into n from public.stints where match_id = m1 and period = 2;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'half a lineup change was stored'); end if;

  n := public.apply_lineup(c1, m1, jsonb_build_array(
    jsonb_build_object('type', 'remove', 'stint', st1)));
  select count(*) into n from public.stints where id = st1;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'apply_lineup did not take a stint back'); end if;

  -- ----- import_season: a whole season, through the match state machine -----
  season := jsonb_build_object(
    'players', jsonb_build_array(
      jsonb_build_object('label', 'Vuk', 'shirt_number', 21, 'birth_quarter', 1),
      jsonb_build_object('label', 'Ris', 'shirt_number', 22, 'birth_quarter', 4)),
    'matches', jsonb_build_array(jsonb_build_object(
      'opponent', 'Sample', 'played_on', current_date - 7, 'period_count', 2,
      'period_minutes', 25,
      'events', jsonb_build_array(
        jsonb_build_object('client_id', gen_random_uuid(), 'period', 1, 'clock_seconds', 60,
          'side', 'home', 'kind', 'goal', 'weight', 3000, 'player_index', 1, 'x', 90, 'y', 50,
          'header', false),
        jsonb_build_object('client_id', gen_random_uuid(), 'period', 2, 'clock_seconds', 30,
          'side', 'away', 'kind', 'corner', 'weight', 250, 'player_index', null, 'x', null,
          'y', null, 'header', false)),
      'stints', jsonb_build_array(
        jsonb_build_object('player_index', 0, 'period', 1, 'on_seconds', 0,
          'off_seconds', 1500)))),
    'sessions', jsonb_build_array(jsonb_build_object(
      'held_on', current_date - 3, 'focus', 'first_touch', 'duration_minutes', 60,
      'area', 'half', 'expected_players', 2, 'floodlit', true,
      'drills', jsonb_build_array(
        jsonb_build_object('position', 1, 'drill_key', 'rondo-4v2', 'minutes', 15)),
      'attendance', jsonb_build_array(
        jsonb_build_object('player_index', 0, 'status', 'present', 'minutes', 60, 'rpe', 6)),
      'observations', jsonb_build_array(
        jsonb_build_object('player_index', 1, 'skill', 'first_touch', 'attempts', 10,
          'successes', 4)))));
  summary := public.import_season(c1, t1, season);
  if summary = jsonb_build_object('players', 2, 'matches', 1, 'events', 2, 'sessions', 1) then
    passed := passed + 1;
  else failures := array_append(failures, format('import_season reported %s', summary)); end if;
  select count(*) into n from public.matches m
  join public.match_events e on e.match_id = m.id
  join public.players p on p.id = e.player_id
  where m.club_id = c1 and m.opponent = 'Sample' and m.status = 'finished' and p.label = 'Ris';
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'imported goal is not tied to the second player'); end if;

  begin
    perform public.import_season(c1, t1, jsonb_build_object(
      'players', jsonb_build_array(
        jsonb_build_object('label', 'Jelen', 'shirt_number', 31, 'birth_quarter', 2)),
      'matches', jsonb_build_array(jsonb_build_object(
        'opponent', 'Broken', 'played_on', current_date - 2, 'period_count', 2,
        'period_minutes', 25, 'events', '[]'::jsonb,
        'stints', jsonb_build_array(
          jsonb_build_object('player_index', 5, 'period', 1, 'on_seconds', 0,
            'off_seconds', 900)))),
      'sessions', '[]'::jsonb));
    failures := array_append(failures, 'import_season accepted a stint for nobody');
  exception when not_null_violation then passed := passed + 1; end;
  select (select count(*) from public.players where club_id = c1 and label = 'Jelen')
    + (select count(*) from public.matches where club_id = c1 and opponent = 'Broken') into n;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'a failed import left rows behind'); end if;

  -- ===== user 2 builds club B and tries every function on club A =====
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c2 := public.create_club('Club B');

  begin
    perform public.plan_session(c1, t1, jsonb_build_object(
      'session', jsonb_build_object('held_on', current_date, 'focus', 'intruder',
        'duration_minutes', 60, 'area', 'half', 'expected_players', 2, 'floodlit', false),
      'drills', '[]'::jsonb, 'player_ids', '[]'::jsonb));
    failures := array_append(failures, 'stranger planned a session in club A');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    perform public.record_attendance(c1, s1, p2, 'present', 60::smallint, 5::smallint);
    failures := array_append(failures, 'stranger recorded attendance in club A');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    -- Their own club id on the outside, club A's session and player on the inside.
    perform public.record_attendance(c2, s1, p2, 'present', 60::smallint, 5::smallint);
    failures := array_append(failures, 'stranger smuggled attendance into club A');
  exception when insufficient_privilege or foreign_key_violation then passed := passed + 1; end;

  begin
    perform public.record_observation(c1, s1, p1, 'finishing', 1::smallint, 1::smallint);
    failures := array_append(failures, 'stranger recorded an observation in club A');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    perform public.apply_lineup(c1, m1, jsonb_build_array(
      jsonb_build_object('type', 'on', 'player', p1, 'period', 2, 'on_seconds', 0)));
    failures := array_append(failures, 'stranger changed the lineup in club A');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    perform public.import_season(c1, t1, season);
    failures := array_append(failures, 'stranger imported a season into club A');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    perform public.erase_player(c1, p1);
    failures := array_append(failures, 'stranger erased a player of club A');
  exception when insufficient_privilege then passed := passed + 1; end;

  begin
    perform public.delete_club(c1);
    failures := array_append(failures, 'stranger deleted club A');
  exception when insufficient_privilege then passed := passed + 1; end;

  -- ===== a signed-out visitor cannot call any of them =====
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform public.delete_club(c1);
    failures := array_append(failures, 'signed-out visitor could call delete_club');
  exception when insufficient_privilege then passed := passed + 1; end;
  begin
    perform public.import_season(c1, t1, season);
    failures := array_append(failures, 'signed-out visitor could call import_season');
  exception when insufficient_privilege then passed := passed + 1; end;

  -- ===== the owner erases a player, then the club =====
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.players where club_id = c1;
  if n = 4 then passed := passed + 1;
  else failures := array_append(failures, format('club A has %s players after the attacks, not 4', n)); end if;

  perform public.erase_player(c1, p1);
  select count(*) into n from public.players where id = p1;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'erase_player left the player'); end if;
  select count(*) into n from public.audit_log
  where club_id = c1 and table_name = 'players' and action = 'delete';
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'erasing a player was not audited'); end if;

  perform public.delete_club(c1);
  select count(*) into n from public.clubs where id = c1;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'delete_club left the club'); end if;
  begin
    perform public.delete_club(c1);
    failures := array_append(failures, 'deleting a club twice did not say so');
  exception when insufficient_privilege then passed := passed + 1; end;

  reset role;
  if cardinality(failures) > 0 then
    raise exception 'atomic writes test FAILED: %', array_to_string(failures, ' | ');
  end if;
  raise notice 'atomic writes test passed: % checks', passed;
end $$;

rollback;
