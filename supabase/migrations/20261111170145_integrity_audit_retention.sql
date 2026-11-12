-- Integrity rules that must hold no matter which client writes: timestamps,
-- the audit trail, the match state machine, write limits, and retention.

create function app.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    new.updated_at := now();
    return new;
  end;
  $$;

-- One audit row per change: who, what table, which row, which columns. Never the values.
create function app.write_audit() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  declare
    current_row jsonb;
    previous_row jsonb;
    target_club uuid;
    row_ref text;
    changed text[];
  begin
    if tg_op = 'DELETE' then
      current_row := to_jsonb(old);
    else
      current_row := to_jsonb(new);
    end if;
    target_club := coalesce(current_row ->> 'club_id', current_row ->> 'id')::uuid;
    -- A club that is being erased takes its trail with it: erasure means erasure.
    if not exists (select 1 from public.clubs c where c.id = target_club) then
      return null;
    end if;
    row_ref := coalesce(
      current_row ->> 'id',
      concat_ws(':', current_row ->> 'session_id', current_row ->> 'player_id',
        current_row ->> 'user_id')
    );
    if tg_op = 'UPDATE' then
      previous_row := to_jsonb(old);
      select array_agg(n.key order by n.key) into changed
      from jsonb_each(current_row) as n
      where n.key <> 'updated_at' and n.value is distinct from previous_row -> n.key;
      if changed is null then
        return null;
      end if;
    end if;
    insert into public.audit_log (club_id, actor_id, action, table_name, row_key, changed_columns)
    values (target_club, (select auth.uid()), lower(tg_op)::public.audit_action, tg_table_name,
      row_ref, changed);
    return null;
  end;
  $$;

-- Match state machine: scheduled -> live -> finished, and a finished match may be reopened.
create function app.enforce_match_status() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if new.status is distinct from old.status and not (
      (old.status = 'scheduled' and new.status = 'live')
      or (old.status = 'live' and new.status = 'finished')
      or (old.status = 'finished' and new.status = 'live')
    ) then
      raise exception 'match status cannot go from % to %', old.status, new.status
        using errcode = '23514';
    end if;
    return new;
  end;
  $$;

-- Checked before an event is stored: the match has started, the period exists,
-- and the author is under the write limit. The limit runs before the side effect.
create function app.guard_match_event() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  declare
    parent_status public.match_status;
    parent_periods smallint;
    recent integer;
  begin
    select m.status, m.period_count into parent_status, parent_periods
    from public.matches m
    where m.id = new.match_id and m.club_id = new.club_id;
    if not found then
      raise exception 'match not found in this club' using errcode = '23503';
    end if;
    if parent_status = 'scheduled' then
      raise exception 'events can be recorded only once the match has started'
        using errcode = '23514';
    end if;
    if new.period > parent_periods then
      raise exception 'period % does not exist in this match', new.period using errcode = '23514';
    end if;
    select count(*) into recent
    from public.match_events e
    where e.created_by = (select auth.uid()) and e.created_at > now() - interval '1 minute';
    if recent >= 600 then
      raise exception 'too many events recorded in the last minute' using errcode = '54000';
    end if;
    return new;
  end;
  $$;

-- A club can never be left without an owner (unless the club itself is being deleted).
create function app.keep_one_owner() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    if old.role = 'owner'
      and (tg_op = 'DELETE' or new.role <> 'owner')
      and exists (select 1 from public.clubs c where c.id = old.club_id)
      and not exists (
        select 1 from public.club_members m
        where m.club_id = old.club_id and m.role = 'owner' and m.user_id <> old.user_id
      )
    then
      raise exception 'a club must keep at least one owner' using errcode = '23514';
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end;
  $$;

revoke all on function app.touch_updated_at() from public;
revoke all on function app.write_audit() from public;
revoke all on function app.enforce_match_status() from public;
revoke all on function app.guard_match_event() from public;
revoke all on function app.keep_one_owner() from public;

create trigger clubs_touch before update on public.clubs
  for each row execute function app.touch_updated_at();
create trigger teams_touch before update on public.teams
  for each row execute function app.touch_updated_at();
create trigger players_touch before update on public.players
  for each row execute function app.touch_updated_at();
create trigger matches_touch before update on public.matches
  for each row execute function app.touch_updated_at();
create trigger sessions_touch before update on public.sessions
  for each row execute function app.touch_updated_at();
create trigger session_attendance_touch before update on public.session_attendance
  for each row execute function app.touch_updated_at();
create trigger observations_touch before update on public.observations
  for each row execute function app.touch_updated_at();

create trigger matches_status before update of status on public.matches
  for each row execute function app.enforce_match_status();
create trigger match_events_guard before insert on public.match_events
  for each row execute function app.guard_match_event();
create trigger club_members_keep_owner before update or delete on public.club_members
  for each row execute function app.keep_one_owner();

create trigger clubs_audit after insert or update or delete on public.clubs
  for each row execute function app.write_audit();
create trigger club_members_audit after insert or update or delete on public.club_members
  for each row execute function app.write_audit();
create trigger teams_audit after insert or update or delete on public.teams
  for each row execute function app.write_audit();
create trigger players_audit after insert or update or delete on public.players
  for each row execute function app.write_audit();
create trigger matches_audit after insert or update or delete on public.matches
  for each row execute function app.write_audit();
create trigger match_events_audit after insert or update or delete on public.match_events
  for each row execute function app.write_audit();
create trigger stints_audit after insert or update or delete on public.stints
  for each row execute function app.write_audit();
create trigger sessions_audit after insert or update or delete on public.sessions
  for each row execute function app.write_audit();
create trigger session_drills_audit after insert or update or delete on public.session_drills
  for each row execute function app.write_audit();
create trigger session_attendance_audit after insert or update or delete
  on public.session_attendance for each row execute function app.write_audit();
create trigger observations_audit after insert or update or delete on public.observations
  for each row execute function app.write_audit();
create trigger data_requests_audit after insert or update or delete on public.data_requests
  for each row execute function app.write_audit();

-- Creating a club and its first owner is one atomic step, limited per account.
create function public.create_club(club_name text, demo boolean default false) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
  declare
    caller uuid := (select auth.uid());
    new_club uuid;
  begin
    if caller is null then
      raise exception 'sign in to create a club' using errcode = '42501';
    end if;
    -- Limit before the side effect: one account cannot mass-produce tenants.
    if (select count(*) from public.clubs c where c.created_by = caller) >= 5 then
      raise exception 'club limit reached for this account' using errcode = '54000';
    end if;
    insert into public.clubs (name, is_demo, created_by)
    values (btrim(club_name), demo, caller)
    returning id into new_club;
    insert into public.club_members (club_id, user_id, role) values (new_club, caller, 'owner');
    return new_club;
  end;
  $$;

-- Everything a club holds, as one document, for the owner. Runs with the caller's rights.
create function public.export_club_data(target_club uuid) returns jsonb
  language plpgsql stable security invoker set search_path = ''
  as $$
  begin
    if not app.is_owner(target_club) then
      raise exception 'only a club owner can export its data' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'exported_at', now(),
      'club', (select to_jsonb(c) from public.clubs c where c.id = target_club),
      'members', coalesce((select jsonb_agg(to_jsonb(r)) from public.club_members r
        where r.club_id = target_club), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(to_jsonb(r)) from public.teams r
        where r.club_id = target_club), '[]'::jsonb),
      'players', coalesce((select jsonb_agg(to_jsonb(r)) from public.players r
        where r.club_id = target_club), '[]'::jsonb),
      'matches', coalesce((select jsonb_agg(to_jsonb(r)) from public.matches r
        where r.club_id = target_club), '[]'::jsonb),
      'match_events', coalesce((select jsonb_agg(to_jsonb(r)) from public.match_events r
        where r.club_id = target_club), '[]'::jsonb),
      'stints', coalesce((select jsonb_agg(to_jsonb(r)) from public.stints r
        where r.club_id = target_club), '[]'::jsonb),
      'sessions', coalesce((select jsonb_agg(to_jsonb(r)) from public.sessions r
        where r.club_id = target_club), '[]'::jsonb),
      'session_drills', coalesce((select jsonb_agg(to_jsonb(r)) from public.session_drills r
        where r.club_id = target_club), '[]'::jsonb),
      'session_attendance', coalesce((select jsonb_agg(to_jsonb(r))
        from public.session_attendance r where r.club_id = target_club), '[]'::jsonb),
      'observations', coalesce((select jsonb_agg(to_jsonb(r)) from public.observations r
        where r.club_id = target_club), '[]'::jsonb),
      'data_requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.data_requests r
        where r.club_id = target_club), '[]'::jsonb)
    );
  end;
  $$;

-- Liveness probe for uptime checks and the post-deploy smoke test. Reveals nothing.
create function public.health() returns jsonb
  language sql stable security invoker set search_path = ''
  as $$ select jsonb_build_object('status', 'ok', 'checked_at', now()); $$;

revoke all on function public.create_club(text, boolean) from public, anon;
revoke all on function public.export_club_data(uuid) from public, anon;
revoke all on function public.health() from public;
grant execute on function public.create_club(text, boolean) to authenticated;
grant execute on function public.export_club_data(uuid) to authenticated;
grant execute on function public.health() to anon, authenticated;

-- Retention: undone events after 30 days, audit rows after a year, demo clubs after a week.
create function app.purge_expired() returns void
  language plpgsql security definer set search_path = ''
  as $$
  begin
    delete from public.match_events e where e.deleted_at < now() - interval '30 days';
    delete from public.audit_log a where a.occurred_at < now() - interval '365 days';
    delete from public.clubs c where c.is_demo and c.created_at < now() - interval '7 days';
  end;
  $$;
revoke all on function app.purge_expired() from public;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('klupa-purge-expired', '15 3 * * *', 'select app.purge_expired()');
