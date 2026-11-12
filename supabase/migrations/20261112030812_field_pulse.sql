-- The field, seen without a session: error reports from the public pages, page-speed samples,
-- and one function that says how the last day went without revealing anything about anyone.

-- 1. Signed-out pages report errors too. The public pages (sign-in, the research page, the
-- shot lab, the replays) run the heaviest code in the app, and until now a crash there was
-- never heard of. Nobody is signed in, so there is no account to count against: signed-out
-- reports share one allowance of sixty an hour for the whole site. A flood can use up that
-- hour's allowance; it cannot fill the table, and it cannot touch a signed-in coach's twenty.
grant usage on schema app to anon;

create or replace function app.report_client_error(error_name text, error_message text,
  error_route text, app_release text, error_fingerprint text) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare
    caller uuid := (select auth.uid());
  begin
    -- The rate limit runs before the side effect: a page stuck in a loop cannot fill the table.
    -- Over the limit the report is dropped quietly; reporting must never cause a second error.
    if caller is null then
      if (select count(*) from public.client_errors e
          where e.user_id is null and e.occurred_at > now() - interval '1 hour') >= 60 then
        return;
      end if;
    elsif (select count(*) from public.client_errors e
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
grant execute on function app.report_client_error(text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.report_client_error(text, text, text, text, text) to anon;

-- 2. Page-speed samples. One row per page load: how long the largest thing on screen took to
-- appear, how slow the slowest tap was, and how much the layout moved, each as one number.
-- No account, no address, no record id: the route arrives with ids already replaced. The app
-- can neither read nor write the table. RETENTION: thirty days (app.purge_expired).
create table public.client_vitals (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  release text not null check (char_length(release) <= 64),
  route text not null check (char_length(route) <= 120),
  lcp_ms integer check (lcp_ms between 0 and 120000),
  inp_ms integer check (inp_ms between 0 and 120000),
  cls_milli integer check (cls_milli between 0 and 100000),
  check (lcp_ms is not null or inp_ms is not null or cls_milli is not null)
);
create index client_vitals_time_idx on public.client_vitals (occurred_at desc);

alter table public.client_vitals enable row level security;
alter table public.client_vitals force row level security;
revoke all on public.client_vitals from anon, authenticated;

create function app.report_vitals(page_route text, app_release text, lcp integer, inp integer,
  cls integer) returns void
  language plpgsql security definer set search_path = ''
  as $$
  begin
    -- Limit before the side effect: 1,200 samples an hour for the whole site, then dropped.
    if (select count(*) from public.client_vitals v
        where v.occurred_at > now() - interval '1 hour') >= 1200 then
      return;
    end if;
    -- A sample no browser could have measured is dropped quietly, like a report over the limit.
    if (lcp is null and inp is null and cls is null)
      or lcp not between 0 and 120000
      or inp not between 0 and 120000
      or cls not between 0 and 100000 then
      return;
    end if;
    insert into public.client_vitals (release, route, lcp_ms, inp_ms, cls_milli)
    values (left(coalesce(app_release, 'unknown'), 64), left(coalesce(page_route, ''), 120),
      lcp, inp, cls);
  end;
  $$;
revoke all on function app.report_vitals(text, text, integer, integer, integer) from public;
grant execute on function app.report_vitals(text, text, integer, integer, integer)
  to anon, authenticated;

create function public.report_vitals(page_route text, app_release text, lcp integer,
  inp integer, cls integer) returns void
  language sql security invoker set search_path = ''
  as $$ select app.report_vitals(page_route, app_release, lcp, inp, cls); $$;
revoke all on function public.report_vitals(text, text, integer, integer, integer) from public;
grant execute on function public.report_vitals(text, text, integer, integer, integer)
  to anon, authenticated;

-- 3. The pulse: counts and percentiles only, so the health endpoint and the monitor can say
-- "error reports are spiking" or "pages got slower" without anyone reading a report. It can
-- be asked by anyone because it answers nothing about anyone.
create function app.field_pulse() returns jsonb
  language sql stable security definer set search_path = ''
  as $$
    select jsonb_build_object(
      'errors_1h', (select count(*) from public.client_errors e
        where e.occurred_at > now() - interval '1 hour'),
      'errors_24h', (select count(*) from public.client_errors e
        where e.occurred_at > now() - interval '24 hours'),
      'error_kinds_24h', (select count(distinct e.fingerprint) from public.client_errors e
        where e.occurred_at > now() - interval '24 hours'),
      'vitals_7d', (select jsonb_build_object(
          'samples', count(*),
          'lcp_p75_ms', round(percentile_cont(0.75) within group (order by v.lcp_ms))::integer,
          'inp_p75_ms', round(percentile_cont(0.75) within group (order by v.inp_ms))::integer,
          'cls_p75_milli',
            round(percentile_cont(0.75) within group (order by v.cls_milli))::integer)
        from public.client_vitals v
        where v.occurred_at > now() - interval '7 days'));
  $$;
revoke all on function app.field_pulse() from public;
grant execute on function app.field_pulse() to anon, authenticated;

create function public.field_pulse() returns jsonb
  language sql stable security invoker set search_path = ''
  as $$ select app.field_pulse(); $$;
revoke all on function public.field_pulse() from public;
grant execute on function public.field_pulse() to anon, authenticated;

-- 4. RETENTION, extended: page-speed samples after thirty days, with the error reports.
create or replace function app.purge_expired() returns void
  language plpgsql security definer set search_path = ''
  as $$
  begin
    delete from public.match_events e where e.deleted_at < now() - interval '30 days';
    delete from public.audit_log a where a.occurred_at < now() - interval '365 days';
    delete from public.clubs c where c.is_demo and c.created_at < now() - interval '7 days';
    delete from public.client_errors e where e.occurred_at < now() - interval '30 days';
    delete from public.client_vitals v where v.occurred_at < now() - interval '30 days';
    delete from auth.users u
    where u.is_anonymous and u.created_at < now() - interval '7 days'
      and not exists (select 1 from public.club_members m where m.user_id = u.id);
  end;
  $$;
revoke all on function app.purge_expired() from public;
