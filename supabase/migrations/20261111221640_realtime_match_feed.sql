-- Live match feed: a second phone (an assistant coach, or anyone with a role in the club) sees
-- the match review change as events are recorded. Realtime checks row-level security for every
-- subscriber, so a change reaches only members who could read the row themselves; signed-out
-- visitors and other clubs receive nothing.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.match_events, public.matches;
