-- Daily Backpressure at hundreds of sequences a day: the rows stay one per
-- sequence (the record); the page's chart reads this per-day, per-column
-- summary instead of the rows. Pressures are normalised to bar (manual rows
-- may be in psi). Runs under the caller's RLS (authenticated read).
create or replace function public.daily_backpressure_daily_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'UTC',
  p_column text default null
)
returns table (
  day date,
  column_name text,
  instrument text,
  sequences integer,
  injections integer,
  initiation_bar numeric,
  initiation_min_bar numeric,
  initiation_max_bar numeric,
  run_max_bar numeric,
  run_min_bar numeric,
  flow_ml_min numeric,
  column_temp_c numeric,
  first_at timestamptz,
  last_at timestamptz,
  noted integer,
  manual integer
)
language sql stable security invoker set search_path = public as $$
  with r as (
    select (d.reading_at at time zone p_tz)::date as day,
           coalesce(d.column_name, '') as col,
           d.instrument,
           case when d.backpressure_unit ilike 'psi' then d.backpressure / 14.5038 else d.backpressure end as bar,
           case when d.backpressure_unit ilike 'psi' then d.pressure_run_max / 14.5038 else d.pressure_run_max end as run_max,
           case when d.backpressure_unit ilike 'psi' then d.pressure_run_min / 14.5038 else d.pressure_run_min end as run_min,
           d.injections_count, d.flow_rate, d.column_temp, d.reading_at, d.notes, d.source
    from public.daily_backpressure_logs d
    where d.reading_at >= p_from and d.reading_at < p_to
      -- p_column = '' selects rows whose column was never recorded
      and (p_column is null or coalesce(d.column_name, '') = p_column)
  )
  select r.day,
         nullif(r.col, ''),
         r.instrument,
         count(*)::integer,
         coalesce(sum(r.injections_count), 0)::integer,
         round(avg(r.bar)::numeric, 2),
         round(min(r.bar)::numeric, 2),
         round(max(r.bar)::numeric, 2),
         round(max(r.run_max)::numeric, 2),
         round(min(r.run_min)::numeric, 2),
         round(avg(r.flow_rate)::numeric, 3),
         round(avg(r.column_temp)::numeric, 1),
         min(r.reading_at),
         max(r.reading_at),
         (count(*) filter (where r.notes is not null and r.notes <> ''))::integer,
         (count(*) filter (where r.source = 'manual'))::integer
  from r
  group by r.day, r.col, r.instrument
  order by r.day, r.col, r.instrument;
$$;
grant execute on function public.daily_backpressure_daily_summary(timestamptz, timestamptz, text, text)
  to authenticated, service_role;
