-- The instrument reports its installed column: the column compartment answers
-- OpenLab's `COL:DATAX?` query (sent just before and after every run) with a
-- JSON record — description, part number, diameter/length/particle size,
-- pressure limit, injection count, first/last use. Agent 1.2.0 forwards it on
-- every run event, pressure_log entry and feed batch. The server matches it to
-- hplc_columns (part number, then name; creating the record when unknown),
-- marks that column as installed on the instrument, and stamps rows with it so
-- the pressure history can be filtered per column.
alter table public.instrument_live_status
  add column if not exists column_info jsonb null;
alter table public.instrument_runs
  add column if not exists column_name text null,
  add column if not exists column_info jsonb null;
alter table public.instrument_pressure_log
  add column if not exists column_name text null;
create index if not exists instrument_pressure_log_column_idx
  on public.instrument_pressure_log (instrument_id, column_name, logged_at desc);

comment on column public.instrument_runs.column_info is
  'Column record the instrument reported for this run (COL:DATAX), normalised by the agent.';
comment on column public.instrument_pressure_log.column_name is
  'hplc_columns.name of the column the instrument reported at the time (null before the first run seen by the agent).';

-- Daily first/last bookends, now filterable by column (new p_column parameter).
drop function if exists public.instrument_pressure_daily_bookends(timestamptz, timestamptz, text, uuid, numeric);
create or replace function public.instrument_pressure_daily_bookends(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'UTC',
  p_instrument_id uuid default null,
  p_min_flow numeric default 0,
  p_column text default null
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
      and (p_column is null or l.column_name = p_column)
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
grant execute on function public.instrument_pressure_daily_bookends(timestamptz, timestamptz, text, uuid, numeric, text)
  to authenticated, service_role;

-- Columns seen in the log over a window (for the column selectors).
create or replace function public.instrument_pressure_log_columns(
  p_from timestamptz,
  p_to timestamptz,
  p_instrument_id uuid default null
)
returns table (column_name text, entries integer, first_at timestamptz, last_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select l.column_name, count(*)::integer, min(l.logged_at), max(l.logged_at)
  from public.instrument_pressure_log l
  where l.logged_at >= p_from and l.logged_at < p_to
    and (p_instrument_id is null or l.instrument_id = p_instrument_id)
    and l.column_name is not null
  group by l.column_name
  order by max(l.logged_at) desc;
$$;
grant execute on function public.instrument_pressure_log_columns(timestamptz, timestamptz, uuid)
  to authenticated, service_role;
