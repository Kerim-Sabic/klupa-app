-- Shot location lets the app compute chance quality (xG) from a tap on the pitch,
-- and keeps the evidence re-computable. Weights are chance quality in 1/10,000 units.
alter table public.match_events
  drop constraint match_events_weight_check,
  alter column weight type integer,
  add constraint match_events_weight_check check (weight between 0 and 10000),
  add column x smallint check (x between 0 and 100),
  add column y smallint check (y between 0 and 100),
  add column header boolean not null default false,
  add constraint match_events_location_pair check ((x is null) = (y is null));

comment on column public.match_events.x is
  'Percent of pitch length towards the goal being attacked (0-100). Null when not tapped.';
comment on column public.match_events.y is 'Percent of pitch width, left to right (0-100).';

-- Relative-age checks need only the quarter of birth. The date itself is never stored.
alter table public.players
  add column birth_quarter smallint check (birth_quarter between 1 and 4);

comment on column public.players.birth_quarter is
  'Quarter of the selection year the player was born in (1-4). Optional. Never a birth date.';

grant update (birth_quarter) on public.players to authenticated;
