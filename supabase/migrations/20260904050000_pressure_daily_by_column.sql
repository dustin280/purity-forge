-- Per local day AND column from the continuous per-minute pressure log: peak
-- (with its time and that minute's mean), first, last, min and entry count.
-- The Daily Backpressure page charts this, one point per day per column, the
-- way the dashboard's daily peak chart does per instrument; the per-sequence
-- rows in daily_backpressure_logs stay the audit record.
create or replace function public.instrument_pressure_daily_by_column(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'UTC',
  p_min_flow numeric default 0
)
returns table (
  day date,
  column_name text,
  instrument_id uuid,
  readings integer,
  first_at timestamptz,
  first_bar numeric,
  last_at timestamptz,
  last_bar numeric,
  min_bar numeric,
  max_bar numeric,
  max_at timestamptz,
  max_mean_bar numeric
)
language sql stable security invoker set search_path = public as $$
  with entries as (
    select l.instrument_id,
           coalesce(l.column_name, '') as col,
           (l.logged_at at time zone p_tz)::date as day,
           l.logged_at, l.pressure_bar, l.pressure_min_bar, l.pressure_max_bar,
           coalesce(l.pressure_max_bar, l.pressure_bar) as peak
    from public.instrument_pressure_log l
    where l.logged_at >= p_from and l.logged_at < p_to
      and (p_min_flow is null or coalesce(l.flow_ml_min, 0) > p_min_flow)
  ),
  firsts as (
    select distinct on (e.instrument_id, e.col, e.day) e.instrument_id, e.col, e.day, e.logged_at, e.pressure_bar
    from entries e order by e.instrument_id, e.col, e.day, e.logged_at asc
  ),
  lasts as (
    select distinct on (e.instrument_id, e.col, e.day) e.instrument_id, e.col, e.day, e.logged_at, e.pressure_bar
    from entries e order by e.instrument_id, e.col, e.day, e.logged_at desc
  ),
  peaks as (
    select distinct on (e.instrument_id, e.col, e.day) e.instrument_id, e.col, e.day, e.logged_at, e.peak, e.pressure_bar
    from entries e order by e.instrument_id, e.col, e.day, e.peak desc, e.logged_at asc
  ),
  agg as (
    select e.instrument_id, e.col, e.day, count(*)::integer as readings,
           min(coalesce(e.pressure_min_bar, e.pressure_bar)) as min_bar,
           max(e.peak) as max_bar
    from entries e group by e.instrument_id, e.col, e.day
  )
  select a.day, nullif(a.col, ''), a.instrument_id, a.readings,
         f.logged_at, f.pressure_bar, l.logged_at, l.pressure_bar,
         a.min_bar, a.max_bar, p.logged_at, p.pressure_bar
  from agg a
  join firsts f using (instrument_id, col, day)
  join lasts l using (instrument_id, col, day)
  join peaks p using (instrument_id, col, day)
  order by a.day, a.col, a.instrument_id;
$$;
grant execute on function public.instrument_pressure_daily_by_column(timestamptz, timestamptz, text, numeric)
  to authenticated, service_role;
