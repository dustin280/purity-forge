-- Interim sterility observations (day 3 / day 7), scoped to the TEST.
--
-- These already existed as day3_*/day7_* columns on analysis_batch_items, but
-- that made recording an observation require the vial to be in an analysis
-- batch first -- and in practice it never was: at the time of writing 16 of
-- the 20 non-HPLC tests belong to no batch at all, and only one batch has
-- ever been created. So the checkpoints were effectively unreachable for
-- most samples.
--
-- USP <71> wants a contemporaneous record of each observation during
-- incubation, so this hangs off the test itself. One row per (test,
-- checkpoint); re-observing the same checkpoint overwrites via upsert rather
-- than accumulating, which keeps "what did we see on day 3" a single answer.
create table if not exists public.sterility_observations (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid not null references public.tests(id) on delete cascade,
  checkpoint   text not null check (checkpoint in ('day3', 'day7')),
  status       text not null check (status in ('clear', 'turbid')),
  notes        text,
  observed_at  timestamptz not null default now(),
  observed_by  uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (test_id, checkpoint)
);

create index if not exists sterility_observations_test_id_idx
  on public.sterility_observations (test_id);

alter table public.sterility_observations enable row level security;

-- Same shape as nonchrom_results: everyone signed in can read, only
-- operational roles can write.
create policy "sterility_observations_select_auth"
  on public.sterility_observations for select
  to authenticated using (true);

create policy "sterility_observations_write_staff"
  on public.sterility_observations for all
  to authenticated
  using (has_role(auth.uid(), 'tech'::app_role) or has_role(auth.uid(), 'reviewer'::app_role) or has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'tech'::app_role) or has_role(auth.uid(), 'reviewer'::app_role) or has_role(auth.uid(), 'admin'::app_role));
