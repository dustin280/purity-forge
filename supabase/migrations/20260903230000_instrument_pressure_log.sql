-- Continuous instrument pressure log.
--
-- The live-feed agent (tools/agilent-tap-agent/) folds the pump's monitor
-- stream (40 Hz pressure, 20 Hz flow) and the column-compartment temperatures
-- into one entry per minute — whenever the instrument is on, idle or running —
-- and posts it as a `pressure_log` event. This table backs the Instrument
-- Pressure Log page (review / filter / print / CSV) and the dashboard's daily
-- first-vs-last pressure chart. Written only by the server (service role);
-- readable by any authenticated user. About 1,440 rows per instrument-day.
create table if not exists public.instrument_pressure_log (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  -- start of the aggregation window (lab PC clock, stored in UTC)
  logged_at timestamptz not null,
  window_s integer not null default 60,
  samples integer not null default 0,
  -- window mean; min/max are the extremes inside the window
  pressure_bar numeric not null,
  pressure_min_bar numeric null,
  pressure_max_bar numeric null,
  flow_ml_min numeric null,
  column_temp_c numeric null,
  state text not null default 'idle',
  sequence_id uuid null references public.instrument_sequences(id) on delete set null,
  run_id uuid null references public.instrument_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (instrument_id, logged_at)
);
alter table public.instrument_pressure_log
  add constraint ipl_state_check check (state in ('idle', 'running'));
alter table public.instrument_pressure_log enable row level security;
create policy ipl_select_auth on public.instrument_pressure_log
  for select to authenticated using (true);
comment on table public.instrument_pressure_log is
  'Continuous pump pressure log from the live instrument feed: one row per window_s (default 60 s) while the instrument is on. pressure_bar is the window mean.';

-- First and last log entries per local day, for the dashboard chart. p_tz is
-- an IANA zone name so "day" is the lab's day rather than UTC's. p_min_flow = 0
-- keeps only entries logged while the pump was delivering (pressure with the
-- pump off is meaningless); null keeps every entry.
create or replace function public.instrument_pressure_daily_bookends(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'UTC',
  p_instrument_id uuid default null,
  p_min_flow numeric default 0
)
returns table (
  instrument_id uuid,
  day date,
  first_at timestamptz,
  first_bar numeric,
  last_at timestamptz,
  last_bar numeric,
  readings integer,
  min_bar numeric,
  max_bar numeric
)
language sql stable security invoker set search_path = public as $$
  with entries as (
    select l.instrument_id,
           (l.logged_at at time zone p_tz)::date as day,
           l.logged_at, l.pressure_bar, l.pressure_min_bar, l.pressure_max_bar
    from public.instrument_pressure_log l
    where l.logged_at >= p_from and l.logged_at < p_to
      and (p_instrument_id is null or l.instrument_id = p_instrument_id)
      and (p_min_flow is null or coalesce(l.flow_ml_min, 0) > p_min_flow)
  ),
  firsts as (
    select distinct on (e.instrument_id, e.day) e.instrument_id, e.day, e.logged_at, e.pressure_bar
    from entries e order by e.instrument_id, e.day, e.logged_at asc
  ),
  lasts as (
    select distinct on (e.instrument_id, e.day) e.instrument_id, e.day, e.logged_at, e.pressure_bar
    from entries e order by e.instrument_id, e.day, e.logged_at desc
  ),
  agg as (
    select e.instrument_id, e.day, count(*)::integer as readings,
           min(coalesce(e.pressure_min_bar, e.pressure_bar)) as min_bar,
           max(coalesce(e.pressure_max_bar, e.pressure_bar)) as max_bar
    from entries e group by e.instrument_id, e.day
  )
  select a.instrument_id, a.day, f.logged_at, f.pressure_bar, l.logged_at, l.pressure_bar,
         a.readings, a.min_bar, a.max_bar
  from agg a
  join firsts f on f.instrument_id = a.instrument_id and f.day = a.day
  join lasts l on l.instrument_id = a.instrument_id and l.day = a.day
  order by a.day, a.instrument_id;
$$;
grant execute on function public.instrument_pressure_daily_bookends(timestamptz, timestamptz, text, uuid, numeric)
  to authenticated, service_role;
