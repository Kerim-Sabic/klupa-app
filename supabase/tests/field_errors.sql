-- Error reports, page-speed samples, the pulse, demo status and retention: rules the database
-- enforces on its own.
-- Runs inside a transaction and rolls back, so it is safe against any database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/field_errors.sql
-- It raises an exception (non-zero exit) listing every failed check.

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  c1 uuid; c2 uuid;
  n integer;
  flag boolean;
  pulse jsonb;
  passed integer := 0;
  failures text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, is_anonymous)
  values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'field-a@test.invalid', now(), now(), false),
    -- A demo account from nine days ago.
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      null, now() - interval '9 days', now(), true);

  -- ===== a signed-in coach =====
  perform set_config('request.jwt.claims',
    json_build_object('sub', u1, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;

  c1 := public.create_club('Field A', true, 'First team', 'u13');
  select is_demo into flag from public.clubs where id = c1;
  if not flag then passed := passed + 1;
  else failures := array_append(failures, 'a signed-in coach made a demo club by asking for one'); end if;
  select count(*) into n from public.teams
  where club_id = c1 and name = 'First team' and age_group = 'u13';
  if n = 1 then passed := passed + 1;
  else failures := array_append(failures, 'the first team was not created with the club'); end if;

  begin
    perform public.create_club('Field broken', false, 'No age given');
    failures := array_append(failures, 'a team without an age group was accepted');
  exception when not_null_violation then passed := passed + 1; end;
  select count(*) into n from public.clubs where name = 'Field broken';
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures, 'a club was kept although its team was refused'); end if;

  for i in 1..22 loop
    perform public.report_client_error('TypeError', 'x is undefined', '/matches/:id', 'abc1234',
      'fp-1');
  end loop;
  begin
    select count(*) into n from public.client_errors;
    failures := array_append(failures, 'the app could read the error reports');
  exception when insufficient_privilege then passed := passed + 1; end;
  begin
    insert into public.client_errors (release, route, name, message, fingerprint)
    values ('r', '/', 'E', 'm', 'f');
    failures := array_append(failures, 'the app could write an error report directly');
  exception when insufficient_privilege then passed := passed + 1; end;

  reset role;
  select count(*) into n from public.client_errors where user_id = u1;
  if n = 20 then passed := passed + 1;
  else failures := array_append(failures, format('%s reports stored in an hour, limit is 20', n)); end if;

  -- ===== a demo account =====
  perform set_config('request.jwt.claims',
    json_build_object('sub', u2, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  set local role authenticated;
  c2 := public.create_club('Field demo');
  select is_demo into flag from public.clubs where id = c2;
  if flag then passed := passed + 1;
  else failures := array_append(failures, 'a demo account made a club that is not a demo'); end if;
  perform public.delete_club(c2);

  -- ===== a signed-out visitor =====
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  -- Signed-out pages report too, against one shared allowance of sixty an hour.
  for i in 1..65 loop
    perform public.report_client_error('RangeError', 'bad frame', '/movement', 'abc1234', 'fp-out');
  end loop;
  begin
    select count(*) into n from public.client_errors;
    failures := array_append(failures, 'a signed-out visitor could read the error reports');
  exception when insufficient_privilege then passed := passed + 1; end;
  begin
    perform public.create_club('Not signed in');
    failures := array_append(failures, 'a signed-out visitor could call a function meant for members');
  exception when insufficient_privilege then passed := passed + 1; end;

  -- Page-speed samples: stored when plausible, dropped quietly when not, never readable.
  perform public.report_vitals('/pro/:n', 'abc1234', 1800, 120, 40);
  -- A browser that could measure only one of the three leaves the others out.
  perform public.report_vitals(page_route => '/pro/:n', app_release => 'abc1234', lcp => 2600);
  perform public.report_vitals('/pro/:n', 'abc1234', -5, 10, 10);
  perform public.report_vitals('/pro/:n', 'abc1234', null, null, null);
  perform public.report_vitals('/pro/:n', 'abc1234', 999999999, 10, 10);
  begin
    select count(*) into n from public.client_vitals;
    failures := array_append(failures, 'a signed-out visitor could read the page-speed samples');
  exception when insufficient_privilege then passed := passed + 1; end;
  begin
    insert into public.client_vitals (release, route, lcp_ms) values ('r', '/', 1);
    failures := array_append(failures, 'a signed-out visitor could write a page-speed sample directly');
  exception when insufficient_privilege then passed := passed + 1; end;

  -- The pulse answers anyone, with counts and percentiles only.
  pulse := public.field_pulse();
  if (pulse ->> 'errors_1h')::integer >= 80 and (pulse ->> 'error_kinds_24h')::integer >= 2
    and (pulse -> 'vitals_7d' ->> 'samples')::integer >= 2
    and (pulse -> 'vitals_7d' ->> 'lcp_p75_ms')::integer > 0
    and not (pulse::text like '%bad frame%') then
    passed := passed + 1;
  else failures := array_append(failures, format('the pulse is wrong: %s', pulse)); end if;

  reset role;
  select count(*) into n from public.client_errors where user_id is null and fingerprint = 'fp-out';
  if n = 60 then passed := passed + 1;
  else failures := array_append(failures,
    format('%s signed-out reports stored in an hour, limit is 60', n)); end if;
  select count(*) into n from public.client_vitals where route = '/pro/:n';
  if n = 2 then passed := passed + 1;
  else failures := array_append(failures,
    format('%s page-speed samples stored, 2 were plausible', n)); end if;
  -- The signed-out flood did not use up the signed-in coach's own allowance.
  select count(*) into n from public.client_errors where user_id = u1;
  if n = 20 then passed := passed + 1;
  else failures := array_append(failures, 'signed-out reports displaced a coach''s reports'); end if;

  -- Closed by a written policy, not only by the absence of one.
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('client_errors', 'client_vitals')
    and permissive = 'RESTRICTIVE' and qual = 'false' and with_check = 'false';
  if n = 2 then passed := passed + 1;
  else failures := array_append(failures,
    format('%s of the 2 report tables carry a closing policy', n)); end if;

  -- ===== retention =====
  update public.client_errors set occurred_at = now() - interval '31 days'
  where user_id = u1 or fingerprint = 'fp-out';
  update public.client_vitals set occurred_at = now() - interval '31 days' where route = '/pro/:n';
  perform app.purge_expired();
  select (select count(*) from auth.users where id = u2)
    + (select count(*) from public.client_errors where user_id = u1 or fingerprint = 'fp-out')
    + (select count(*) from public.client_vitals where route = '/pro/:n')
    + (select 1 - count(*) from auth.users where id = u1) into n;
  if n = 0 then passed := passed + 1;
  else failures := array_append(failures,
    'retention kept an old demo account, old reports or old samples, or removed a real account'); end if;

  if cardinality(failures) > 0 then
    raise exception 'field errors test FAILED: %', array_to_string(failures, ' | ');
  end if;
  raise notice 'field errors test passed: % checks', passed;
end $$;

rollback;
