-- The two report tables say in a policy that they are closed.
--
-- `client_errors` and `client_vitals` have row-level security enabled and forced, no grants to
-- the app's roles, and until now no policy: with security on and no policy, every row is
-- already refused. That is correct, but it is a rule a reader has to infer from an absence.
-- A restrictive policy that is false for everyone writes the rule down. Being restrictive, it
-- also holds if a permissive policy is ever added by mistake: both would have to pass.
--
-- Reports still arrive only through `app.report_client_error` and `app.report_vitals`, which
-- run with their owner's rights, and are read only by `app.field_pulse`, as counts.

create policy client_errors_closed on public.client_errors
  as restrictive for all to public
  using (false) with check (false);

create policy client_vitals_closed on public.client_vitals
  as restrictive for all to public
  using (false) with check (false);
