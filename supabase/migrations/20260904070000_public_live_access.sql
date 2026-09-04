-- Public live-feed viewer (/live) behind one-time passcodes.
--
-- An admin generates a passcode in the app (Live Instruments → Public viewer
-- passcodes) and hands it to someone. On the public page the code is
-- redeemed once: it becomes a session token that reads the live feed through
-- /api/public/live/snapshot (service role, no Supabase login) for 12 hours.
-- Unredeemed codes lapse after 24 h; any code/session can be revoked.
-- Only hashes are stored; the code is shown once at creation.
create table if not exists public.public_live_access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  -- last characters of the code, to tell entries apart in the admin list
  code_hint text not null,
  label text null,
  -- restrict the viewer to one instrument; null = any active instrument
  instrument_id uuid null references public.instruments(id) on delete cascade,
  created_by uuid null,
  created_at timestamptz not null default now(),
  code_expires_at timestamptz not null,
  redeemed_at timestamptz null,
  session_token_hash text null,
  session_expires_at timestamptz null,
  revoked_at timestamptz null,
  last_seen_at timestamptz null
);
create index if not exists public_live_access_codes_session_idx
  on public.public_live_access_codes (session_token_hash) where session_token_hash is not null;

alter table public.public_live_access_codes enable row level security;
create policy plac_admin_all on public.public_live_access_codes
  for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));
comment on table public.public_live_access_codes is
  'One-time passcodes for the public live chromatogram viewer (/live); redeemed once into a 12 h session token. Hashes only.';
