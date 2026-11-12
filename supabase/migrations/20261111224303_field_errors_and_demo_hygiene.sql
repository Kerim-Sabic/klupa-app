-- Errors seen in the field, and three rules that no longer depend on the client.

-- 1. Error reports from the app. A coach's phone tells us when a screen broke: the error's
-- name, a scrubbed message, the route pattern and the release, never record contents. The app
-- can neither read nor write the table: reports arrive only through the function below, which
-- limits each account to twenty an hour. RETENTION: thirty days (app.purge_expired).
create table public.client_errors (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  release text not null check (char_length(release) <= 64),
  route text not null check (char_length(route) <= 120),
  name text not null check (char_length(name) <= 80),
  message text not null check (char_length(message) <= 300),
  fingerprint text not null check (char_length(fingerprint) <= 64)
);
create index client_errors_time_idx on public.client_errors (occurred_at desc);
create index client_errors_fingerprint_idx on public.client_errors (fingerprint, occurred_at desc);
create index client_errors_user_idx on public.client_errors (user_id, occurred_at desc);

alter table public.client_errors enable row level security;
alter table public.client_errors force row level security;
revoke all on public.client_errors from anon, authenticated;

create function app.report_client_error(error_name text, error_message text, error_route text,
  app_release text, error_fingerprint text) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare
    caller uuid := (select auth.uid());
  begin
    if caller is null then
      raise exception 'sign in to report an error' using errcode = '42501';
    end if;
    -- The rate limit runs before the side effect: a page stuck in a loop cannot fill the table.
    -- Over the limit the report is dropped quietly; reporting must never cause a second error.
    if (select count(*) from public.client_errors e
        where e.user_id = caller and e.occurred_at > now() - interval '1 hour') >= 20 then
      return;
    end if;
    insert into public.client_errors (user_id, release, route, name, message, fingerprint)
    values (caller,
      left(coalesce(app_release, 'unknown'), 64),
      left(coalesce(error_route, ''), 120),
      left(coalesce(error_name, 'Error'), 80),
      left(coalesce(error_message, ''), 300),
      left(coalesce(error_fingerprint, ''), 64));
  end;
  $$;
revoke all on function app.report_client_error(text, text, text, text, text) from public;
grant execute on function app.report_client_error(text, text, text, text, text) to authenticated;

create function public.report_client_error(error_name text, error_message text,
  error_route text, app_release text, error_fingerprint text) returns void
  language sql security invoker set search_path = ''
  as $$ select app.report_client_error(error_name, error_message, error_route, app_release,
    error_fingerprint); $$;
revoke all on function public.report_client_error(text, text, text, text, text)
  from public, anon;
grant execute on function public.report_client_error(text, text, text, text, text)
  to authenticated;

-- 2. A club and its first team are created together, and whether the club is a demo is
-- decided here from the session, never by the client: a demo account cannot be signed back
-- into, so everything it creates is a demo club and is purged after a week.
drop function public.create_club(text, boolean);
drop function app.create_club(text, boolean);

create function app.create_club(club_name text, team_name text, team_age public.age_group)
  returns uuid
  language plpgsql security definer set search_path = ''
  as $$
  declare
    caller uuid := (select auth.uid());
    demo boolean := coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
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
    if team_name is not null then
      insert into public.teams (club_id, name, age_group)
      values (new_club, btrim(team_name), team_age);
    end if;
    return new_club;
  end;
  $$;
revoke all on function app.create_club(text, text, public.age_group) from public;
grant execute on function app.create_club(text, text, public.age_group) to authenticated;

-- `demo` is still accepted so a phone running the previous release keeps working; it is ignored.
create function public.create_club(club_name text, demo boolean default false,
  team_name text default null, team_age public.age_group default null) returns uuid
  language sql security invoker set search_path = ''
  as $$ select app.create_club(club_name, team_name, team_age); $$;
revoke all on function public.create_club(text, boolean, text, public.age_group)
  from public, anon;
grant execute on function public.create_club(text, boolean, text, public.age_group)
  to authenticated;

-- 3. RETENTION, extended: error reports after thirty days, and demo accounts once they are a
-- week old and belong to no club (their demo clubs are purged by the line above them).
create or replace function app.purge_expired() returns void
  language plpgsql security definer set search_path = ''
  as $$
  begin
    delete from public.match_events e where e.deleted_at < now() - interval '30 days';
    delete from public.audit_log a where a.occurred_at < now() - interval '365 days';
    delete from public.clubs c where c.is_demo and c.created_at < now() - interval '7 days';
    delete from public.client_errors e where e.occurred_at < now() - interval '30 days';
    delete from auth.users u
    where u.is_anonymous and u.created_at < now() - interval '7 days'
      and not exists (select 1 from public.club_members m where m.user_id = u.id);
  end;
  $$;
revoke all on function app.purge_expired() from public;
