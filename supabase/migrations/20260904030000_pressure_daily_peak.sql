-- Dashboard chart now plots each day's highest pressure. Extend the daily
-- aggregate with the peak's time and the minute mean at that moment
-- (first/last stay for the tooltip). Return type changes, so drop first.
drop function if exists public.instrument_pressure_daily_bookends(timestamptz, timestamptz, text, uuid, numeric, text);
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
  max_bar numeric,
  max_at timestamptz,
  max_mean_bar numeric
)
language sql stable security invoker set search_path = public as $$
  with entries as (
    select l.instrument_id,
           (l.logged_at at time zone p_tz)::date as day,
           l.logged_at, l.pressure_bar, l.pressure_min_bar, l.pressure_max_bar,
           coalesce(l.pressure_max_bar, l.pressure_bar) as peak
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
  peaks as (
    select distinct on (e.instrument_id, e.day) e.instrument_id, e.day, e.logged_at, e.peak, e.pressure_bar
    from entries e order by e.instrument_id, e.day, e.peak desc, e.logged_at asc
  ),
  agg as (
    select e.instrument_id, e.day, count(*)::integer as readings,
           min(coalesce(e.pressure_min_bar, e.pressure_bar)) as min_bar,
           max(e.peak) as max_bar
    from entries e group by e.instrument_id, e.day
  )
  select a.instrument_id, a.day, f.logged_at, f.pressure_bar, l.logged_at, l.pressure_bar,
         a.readings, a.min_bar, a.max_bar, p.logged_at, p.pressure_bar
  from agg a
  join firsts f on f.instrument_id = a.instrument_id and f.day = a.day
  join lasts l on l.instrument_id = a.instrument_id and l.day = a.day
  join peaks p on p.instrument_id = a.instrument_id and p.day = a.day
  order by a.day, a.instrument_id;
$$;
grant execute on function public.instrument_pressure_daily_bookends(timestamptz, timestamptz, text, uuid, numeric, text)
  to authenticated, service_role;
