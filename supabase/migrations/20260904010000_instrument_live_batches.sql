-- Rolling cache of the live feed, so the Live Instruments page can show the
-- last hour the moment it opens (a browser that was not subscribed has seen
-- nothing). /api/instrument/feed stores one row per batch (~1/s per
-- instrument) with the streams decimated to at most 5 Hz (temperatures 1 Hz)
-- and each stream's wall-clock start (w0, epoch seconds), and prunes rows older
-- than the cache window every couple of minutes; pg_cron backstops that for
-- instruments that have gone quiet. Read through getInstrumentLiveHistory().
create table if not exists public.instrument_live_batches (
  id bigint generated always as identity primary key,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  batch_seq integer not null,
  sent_at timestamptz not null,
  received_at timestamptz not null default now(),
  state text not null default 'idle',
  run_key text null,
  run_index integer null,
  run_started_at timestamptz null,
  -- {stream: {units, dt, w0, values[]}}, w0 = epoch seconds of values[0]
  streams jsonb not null,
  labels jsonb null
);
create index if not exists instrument_live_batches_time_idx
  on public.instrument_live_batches (instrument_id, sent_at desc);
alter table public.instrument_live_batches enable row level security;
create policy ilb_select_auth on public.instrument_live_batches
  for select to authenticated using (true);
comment on table public.instrument_live_batches is
  'Rolling ~60 min cache of live feed batches (decimated) for the Live Instruments page; pruned by the feed route and by pg_cron.';

select cron.schedule(
  'instrument-live-batches-prune',
  '*/15 * * * *',
  $$delete from public.instrument_live_batches where sent_at < now() - interval '2 hours'$$
);
