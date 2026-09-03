-- Live instrument feed: an on-prem agent taps the Agilent instrument LAN
-- (read-only packet capture), decodes the pump/DAD/thermostat streams, and
-- POSTs them to /api/instrument/feed and /api/instrument/event, signed per
-- instrument. This migration adds the tables that feed writes into, the
-- storage bucket for per-run traces, and lets Daily Backpressure rows be
-- sourced from the live feed instead of the hourly Drive .dx importer.
--
-- Writes to every new table happen only through the server (service role);
-- authenticated users can read. Feed keys are admin-only.

-- Per-instrument shared secrets for the agent's HMAC-signed requests.
create table if not exists public.instrument_feed_keys (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  label text not null default 'default',
  secret text not null,
  is_active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz null,
  last_agent_host text null,
  last_agent_version text null
);
create index if not exists instrument_feed_keys_instrument_idx
  on public.instrument_feed_keys (instrument_id) where is_active;

alter table public.instrument_feed_keys enable row level security;
create policy ifk_select_admin on public.instrument_feed_keys
  for select to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy ifk_admin_all on public.instrument_feed_keys
  for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- One row per instrument: what the agent last reported. Drives the status
-- list on the Live Instruments page; the high-rate samples themselves go out
-- over Realtime broadcast (topic instrument:<id>) and are not stored here.
create table if not exists public.instrument_live_status (
  instrument_id uuid primary key references public.instruments(id) on delete cascade,
  status text not null default 'offline',
  run_state integer null,
  analysis_state integer null,
  ready_state integer null,
  error_state integer null,
  not_ready_text text null,
  current_sequence_id uuid null,
  current_run_id uuid null,
  last_batch_at timestamptz null,
  last_event_at timestamptz null,
  latest jsonb not null default '{}'::jsonb,
  streams jsonb not null default '[]'::jsonb,
  modules jsonb not null default '[]'::jsonb,
  agent_host text null,
  agent_version text null,
  updated_at timestamptz not null default now()
);
alter table public.instrument_live_status
  add constraint ils_status_check check (status in ('offline', 'idle', 'running'));
alter table public.instrument_live_status enable row level security;
create policy ils_select_auth on public.instrument_live_status
  for select to authenticated using (true);

-- A sequence = one OpenLab analysis (AnalysisState active), i.e. the grain
-- the Daily Backpressure log uses (one row per sequence, first injection's
-- initiation values, injections counted as they happen).
create table if not exists public.instrument_sequences (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  agent_sequence_key text not null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  status text not null default 'running',
  injections_count integer not null default 0,
  backpressure_log_id uuid null references public.daily_backpressure_logs(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instrument_id, agent_sequence_key)
);
alter table public.instrument_sequences
  add constraint iseq_status_check check (status in ('running', 'completed', 'aborted'));
create index if not exists instrument_sequences_started_idx
  on public.instrument_sequences (instrument_id, started_at desc);
alter table public.instrument_sequences enable row level security;
create policy iseq_select_auth on public.instrument_sequences
  for select to authenticated using (true);

-- A run = one injection / acquisition (RunState running). Its decoded
-- traces are stored as JSON in the instrument-traces bucket for replay.
create table if not exists public.instrument_runs (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  sequence_id uuid null references public.instrument_sequences(id) on delete set null,
  agent_run_key text not null,
  injection_index integer not null default 1,
  started_at timestamptz not null,
  ended_at timestamptz null,
  duration_s numeric null,
  status text not null default 'running',
  summary jsonb not null default '{}'::jsonb,
  trace_path text null,
  sample_position text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instrument_id, agent_run_key)
);
alter table public.instrument_runs
  add constraint irun_status_check check (status in ('running', 'completed', 'aborted'));
create index if not exists instrument_runs_started_idx
  on public.instrument_runs (instrument_id, started_at desc);
create index if not exists instrument_runs_sequence_idx
  on public.instrument_runs (sequence_id);
alter table public.instrument_runs enable row level security;
create policy irun_select_auth on public.instrument_runs
  for select to authenticated using (true);

create trigger instrument_live_status_set_updated_at
  before update on public.instrument_live_status
  for each row execute function public.set_updated_at();
create trigger instrument_sequences_set_updated_at
  before update on public.instrument_sequences
  for each row execute function public.set_updated_at();
create trigger instrument_runs_set_updated_at
  before update on public.instrument_runs
  for each row execute function public.set_updated_at();

-- Daily Backpressure rows can now come from the live feed. Additive and
-- nullable: manual and Drive-imported rows are untouched.
alter table public.daily_backpressure_logs
  add column if not exists instrument_id uuid null references public.instruments(id) on delete set null,
  add column if not exists instrument_sequence_id uuid null references public.instrument_sequences(id) on delete set null;
alter table public.daily_backpressure_logs drop constraint if exists dbl_source_check;
alter table public.daily_backpressure_logs
  add constraint dbl_source_check check (source = any (array['manual'::text, 'auto'::text, 'live'::text]));

comment on column public.daily_backpressure_logs.instrument_sequence_id is
  'Set when source = ''live'': the instrument_sequences row this reading summarizes.';

-- Per-run decoded traces (JSON) for replay in the same viewer as the live feed.
insert into storage.buckets (id, name, public)
  values ('instrument-traces', 'instrument-traces', false)
  on conflict (id) do nothing;
create policy instrument_traces_select_auth on storage.objects
  for select to authenticated using (bucket_id = 'instrument-traces');
