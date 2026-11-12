-- Writes that touch more than one row or table run as one database function, so each is a
-- single transaction: all of it is stored, or none of it. The client no longer strings
-- inserts together and cleans up after a failure, and it issues no DELETE of its own.
--
-- Every function runs with the caller's own rights (security invoker): row-level security,
-- the column grants, the audit triggers, the match state machine and the event limit all
-- apply exactly as they do to a single write.

-- A planned session: the session, its drills in order, and one expected row per player.
create function public.plan_session(target_club uuid, target_team uuid, plan jsonb) returns uuid
  language plpgsql security invoker set search_path = ''
  as $$
  declare
    new_session uuid;
  begin
    insert into public.sessions (club_id, team_id, held_on, focus, duration_minutes, area,
      expected_players, floodlit, source_match_id)
    values (target_club, target_team,
      (plan #>> '{session,held_on}')::date,
      plan #>> '{session,focus}',
      (plan #>> '{session,duration_minutes}')::smallint,
      (plan #>> '{session,area}')::public.pitch_area,
      (plan #>> '{session,expected_players}')::smallint,
      coalesce((plan #>> '{session,floodlit}')::boolean, false),
      (plan #>> '{session,source_match_id}')::uuid)
    returning id into new_session;

    insert into public.session_drills (club_id, session_id, position, drill_key, minutes)
    select target_club, new_session, d.position, d.drill_key, d.minutes
    from jsonb_to_recordset(coalesce(plan -> 'drills', '[]'::jsonb))
      as d(position smallint, drill_key text, minutes smallint);

    insert into public.session_attendance (club_id, session_id, player_id, status)
    select target_club, new_session, p.entry::uuid, 'expected'
    from jsonb_array_elements_text(coalesce(plan -> 'player_ids', '[]'::jsonb)) as p(entry);

    return new_session;
  end;
  $$;

-- One player's attendance at a session: stored, or corrected if it was already there.
create function public.record_attendance(target_club uuid, target_session uuid,
  target_player uuid, new_status public.attendance_status, new_minutes smallint default null,
  new_rpe smallint default null) returns void
  language sql security invoker set search_path = ''
  as $$
    insert into public.session_attendance (club_id, session_id, player_id, status, minutes, rpe)
    values (target_club, target_session, target_player, new_status, new_minutes, new_rpe)
    on conflict (session_id, player_id) do update
      set status = excluded.status, minutes = excluded.minutes, rpe = excluded.rpe;
  $$;

-- One player's tally for one skill at a session: stored, or corrected.
create function public.record_observation(target_club uuid, target_session uuid,
  target_player uuid, skill_key text, new_attempts smallint, new_successes smallint)
  returns void
  language sql security invoker set search_path = ''
  as $$
    insert into public.observations (club_id, session_id, player_id, skill, attempts, successes)
    values (target_club, target_session, target_player, skill_key, new_attempts, new_successes)
    on conflict (session_id, player_id, skill) do update
      set attempts = excluded.attempts, successes = excluded.successes;
  $$;

-- A lineup change is a list of steps (a substitution is two): players going on, players
-- coming off, and a stint taken back because no time had passed. All of them, or none.
create function public.apply_lineup(target_club uuid, target_match uuid, changes jsonb)
  returns integer
  language plpgsql security invoker set search_path = ''
  as $$
  declare
    step jsonb;
    touched integer;
    applied integer := 0;
  begin
    if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) > 60 then
      raise exception 'a lineup change is a list of at most 60 steps' using errcode = '22023';
    end if;
    for step in select c.entry from jsonb_array_elements(changes) as c(entry) loop
      if step ->> 'type' = 'on' then
        insert into public.stints (club_id, match_id, player_id, period, on_seconds)
        values (target_club, target_match, (step ->> 'player')::uuid,
          (step ->> 'period')::smallint, (step ->> 'on_seconds')::integer);
        touched := 1;
      elsif step ->> 'type' = 'off' then
        update public.stints s set off_seconds = (step ->> 'off_seconds')::integer
        where s.club_id = target_club and s.match_id = target_match
          and s.id = (step ->> 'stint')::uuid;
        get diagnostics touched = row_count;
      elsif step ->> 'type' = 'remove' then
        delete from public.stints s
        where s.club_id = target_club and s.match_id = target_match
          and s.id = (step ->> 'stint')::uuid;
        get diagnostics touched = row_count;
      else
        raise exception 'unknown lineup step' using errcode = '22023';
      end if;
      if touched = 0 then
        raise exception 'that stint is not in this match' using errcode = '42501';
      end if;
      applied := applied + 1;
    end loop;
    return applied;
  end;
  $$;

-- A whole season in one go (the sample season, or a later import). Players are referred to
-- by their place in the list. Each match walks the same state machine a coach's match does:
-- scheduled, live (events are only accepted then), finished.
create function public.import_season(target_club uuid, target_team uuid, season jsonb)
  returns jsonb
  language plpgsql security invoker set search_path = ''
  as $$
  declare
    squad uuid[];
    item jsonb;
    new_match uuid;
    new_session uuid;
    added integer;
    event_total integer := 0;
    match_total integer := 0;
    session_total integer := 0;
  begin
    if jsonb_array_length(coalesce(season -> 'players', '[]'::jsonb)) > 40
      or jsonb_array_length(coalesce(season -> 'matches', '[]'::jsonb)) > 20
      or jsonb_array_length(coalesce(season -> 'sessions', '[]'::jsonb)) > 60
    then
      raise exception 'a season import is limited in size' using errcode = '54000';
    end if;

    with listed as (
      select p.place, p.entry
      from jsonb_array_elements(coalesce(season -> 'players', '[]'::jsonb))
        with ordinality as p(entry, place)
    ), stored as (
      insert into public.players (club_id, team_id, label, shirt_number, consent,
        consent_recorded_at, birth_quarter)
      select target_club, target_team, l.entry ->> 'label',
        (l.entry ->> 'shirt_number')::smallint, 'granted', now(),
        (l.entry ->> 'birth_quarter')::smallint
      from listed l
      returning id, shirt_number
    )
    select array_agg(s.id order by l.place) into squad
    from listed l
    join stored s on s.shirt_number = (l.entry ->> 'shirt_number')::smallint;

    for item in
      select m.entry from jsonb_array_elements(coalesce(season -> 'matches', '[]'::jsonb))
        with ordinality as m(entry, place) order by m.place
    loop
      insert into public.matches (club_id, team_id, opponent, played_on, period_count,
        period_minutes)
      values (target_club, target_team, item ->> 'opponent', (item ->> 'played_on')::date,
        (item ->> 'period_count')::smallint, (item ->> 'period_minutes')::smallint)
      returning id into new_match;

      update public.matches m set status = 'live'
      where m.club_id = target_club and m.id = new_match;

      insert into public.match_events (club_id, match_id, client_id, period, clock_seconds,
        side, kind, weight, player_id, x, y, header)
      select target_club, new_match, (e.entry ->> 'client_id')::uuid,
        (e.entry ->> 'period')::smallint, (e.entry ->> 'clock_seconds')::integer,
        (e.entry ->> 'side')::public.event_side, (e.entry ->> 'kind')::public.event_kind,
        (e.entry ->> 'weight')::integer, squad[(e.entry ->> 'player_index')::integer + 1],
        (e.entry ->> 'x')::smallint, (e.entry ->> 'y')::smallint,
        coalesce((e.entry ->> 'header')::boolean, false)
      from jsonb_array_elements(coalesce(item -> 'events', '[]'::jsonb)) as e(entry);
      get diagnostics added = row_count;
      event_total := event_total + added;

      insert into public.stints (club_id, match_id, player_id, period, on_seconds, off_seconds)
      select target_club, new_match, squad[(s.entry ->> 'player_index')::integer + 1],
        (s.entry ->> 'period')::smallint, (s.entry ->> 'on_seconds')::integer,
        (s.entry ->> 'off_seconds')::integer
      from jsonb_array_elements(coalesce(item -> 'stints', '[]'::jsonb)) as s(entry);

      update public.matches m set status = 'finished'
      where m.club_id = target_club and m.id = new_match;
      match_total := match_total + 1;
    end loop;

    for item in
      select t.entry from jsonb_array_elements(coalesce(season -> 'sessions', '[]'::jsonb))
        with ordinality as t(entry, place) order by t.place
    loop
      insert into public.sessions (club_id, team_id, held_on, status, focus, duration_minutes,
        area, expected_players, floodlit)
      values (target_club, target_team, (item ->> 'held_on')::date, 'completed',
        item ->> 'focus', (item ->> 'duration_minutes')::smallint,
        (item ->> 'area')::public.pitch_area, (item ->> 'expected_players')::smallint,
        coalesce((item ->> 'floodlit')::boolean, false))
      returning id into new_session;

      insert into public.session_drills (club_id, session_id, position, drill_key, minutes)
      select target_club, new_session, d.position, d.drill_key, d.minutes
      from jsonb_to_recordset(coalesce(item -> 'drills', '[]'::jsonb))
        as d(position smallint, drill_key text, minutes smallint);

      insert into public.session_attendance (club_id, session_id, player_id, status, minutes,
        rpe)
      select target_club, new_session, squad[a.player_index + 1], a.status, a.minutes, a.rpe
      from jsonb_to_recordset(coalesce(item -> 'attendance', '[]'::jsonb))
        as a(player_index integer, status public.attendance_status, minutes smallint,
          rpe smallint);

      insert into public.observations (club_id, session_id, player_id, skill, attempts,
        successes)
      select target_club, new_session, squad[o.player_index + 1], o.skill, o.attempts,
        o.successes
      from jsonb_to_recordset(coalesce(item -> 'observations', '[]'::jsonb))
        as o(player_index integer, skill text, attempts smallint, successes smallint);
      session_total := session_total + 1;
    end loop;

    return jsonb_build_object(
      'players', coalesce(cardinality(squad), 0),
      'matches', match_total,
      'events', event_total,
      'sessions', session_total
    );
  end;
  $$;

-- Erasure is a named, audited act, never a stray DELETE from the browser. A player's row goes;
-- their events stay with the match, detached from the person (see the foreign keys).
create function public.erase_player(target_club uuid, target_player uuid) returns void
  language plpgsql security invoker set search_path = ''
  as $$
  begin
    delete from public.players p where p.club_id = target_club and p.id = target_player;
    if not found then
      raise exception 'no such player, or not yours to erase' using errcode = '42501';
    end if;
  end;
  $$;

-- The club and everything it holds, through the cascading foreign keys. Owners only (RLS).
create function public.delete_club(target_club uuid) returns void
  language plpgsql security invoker set search_path = ''
  as $$
  begin
    delete from public.clubs c where c.id = target_club;
    if not found then
      raise exception 'no such club, or not yours to delete' using errcode = '42501';
    end if;
  end;
  $$;

revoke all on function public.plan_session(uuid, uuid, jsonb) from public, anon;
revoke all on function public.record_attendance(uuid, uuid, uuid, public.attendance_status,
  smallint, smallint) from public, anon;
revoke all on function public.record_observation(uuid, uuid, uuid, text, smallint, smallint)
  from public, anon;
revoke all on function public.apply_lineup(uuid, uuid, jsonb) from public, anon;
revoke all on function public.import_season(uuid, uuid, jsonb) from public, anon;
revoke all on function public.erase_player(uuid, uuid) from public, anon;
revoke all on function public.delete_club(uuid) from public, anon;

grant execute on function public.plan_session(uuid, uuid, jsonb) to authenticated;
grant execute on function public.record_attendance(uuid, uuid, uuid, public.attendance_status,
  smallint, smallint) to authenticated;
grant execute on function public.record_observation(uuid, uuid, uuid, text, smallint, smallint)
  to authenticated;
grant execute on function public.apply_lineup(uuid, uuid, jsonb) to authenticated;
grant execute on function public.import_season(uuid, uuid, jsonb) to authenticated;
grant execute on function public.erase_player(uuid, uuid) to authenticated;
grant execute on function public.delete_club(uuid) to authenticated;
