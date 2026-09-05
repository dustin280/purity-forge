-- Solvent bottle levels from the pump status (agent >= 1.5.0) and low-solvent alerts.
--
-- The binary pump reports its bottle counters in every status push
-- (ACT:CNT "BOTA",v1,v2,v3 ... in µL; remaining = v3 - v2, v3 = bottle size),
-- kept in sync with the LS-1 level sensing module by the stack itself. The
-- agent forwards them on every feed batch, heartbeat and pressure_log entry.
alter table public.instrument_live_status add column if not exists solvents jsonb null;
comment on column public.instrument_live_status.solvents is
  'Latest solvent bottle levels from the pump status (agent >= 1.5.0): {seen_at, bottles:[{key,name,configured,remaining_ml,capacity_ml,pct}], waste_ml}.';
alter table public.instrument_pressure_log add column if not exists solvents jsonb null;
comment on column public.instrument_pressure_log.solvents is
  'Solvent bottle levels at the end of the window (same shape as instrument_live_status.solvents).';
alter table public.instruments add column if not exists solvent_alert_pct integer not null default 20;
comment on column public.instruments.solvent_alert_pct is
  'A bottle below this percentage of its size raises a low-solvent alert (email/SMS to subscribed notification recipients).';
alter table public.notification_recipients add column if not exists alert_solvent_low boolean not null default false;
comment on column public.notification_recipients.alert_solvent_low is
  'Subscribed to low-solvent alerts from the live instrument feed.';

create table if not exists public.instrument_solvent_alerts (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  bottle_key text not null,     -- pump name: BOTA / BOTA1 / BOTB / BOTB1
  bottle_name text not null,    -- A1 / A2 / B1 / B2
  threshold_pct integer not null,
  pct numeric not null,
  remaining_ml numeric null,
  capacity_ml numeric null,
  triggered_at timestamptz not null default now(),
  notified_at timestamptz null,
  notify_result jsonb null,
  cleared_at timestamptz null,
  cleared_pct numeric null,
  created_at timestamptz not null default now()
);
create index if not exists instrument_solvent_alerts_open_idx
  on public.instrument_solvent_alerts (instrument_id, bottle_key) where cleared_at is null;
create index if not exists instrument_solvent_alerts_time_idx
  on public.instrument_solvent_alerts (instrument_id, triggered_at desc);
alter table public.instrument_solvent_alerts enable row level security;
drop policy if exists isa_select_auth on public.instrument_solvent_alerts;
create policy isa_select_auth on public.instrument_solvent_alerts
  for select to authenticated using (true);
comment on table public.instrument_solvent_alerts is
  'Low-solvent alerts raised by the instrument feed: one open row per instrument and bottle while it is below the threshold; written by the feed route (service role).';
