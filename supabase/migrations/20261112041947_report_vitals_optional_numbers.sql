-- A page-speed sample may leave out a number the browser could not measure.
--
-- The three numbers had no defaults, so a call that left one out (a browser with no
-- interaction yet, or one that cannot measure layout movement) matched no function and was
-- answered 404: the sample was lost and the page logged an error. Each number now defaults to
-- null, which the function already treats as "not measured".
create or replace function app.report_vitals(page_route text, app_release text,
  lcp integer default null, inp integer default null, cls integer default null) returns void
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

create or replace function public.report_vitals(page_route text, app_release text,
  lcp integer default null, inp integer default null, cls integer default null) returns void
  language sql security invoker set search_path = ''
  as $$ select app.report_vitals(page_route, app_release, lcp, inp, cls); $$;
revoke all on function public.report_vitals(text, text, integer, integer, integer) from public;
grant execute on function public.report_vitals(text, text, integer, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
