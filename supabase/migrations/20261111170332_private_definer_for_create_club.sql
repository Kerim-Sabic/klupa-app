-- Privileged code lives in the private app schema only. The public API exposes
-- a thin wrapper that runs with the caller's own rights, so no SECURITY DEFINER
-- function is directly reachable through the REST API.

drop function public.create_club(text, boolean);

create function app.create_club(club_name text, demo boolean) returns uuid
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
revoke all on function app.create_club(text, boolean) from public;
grant execute on function app.create_club(text, boolean) to authenticated;

create function public.create_club(club_name text, demo boolean default false) returns uuid
  language sql security invoker set search_path = ''
  as $$ select app.create_club(club_name, demo); $$;
revoke all on function public.create_club(text, boolean) from public, anon;
grant execute on function public.create_club(text, boolean) to authenticated;
