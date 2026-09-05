-- Public viewer passcodes: a watch session is a window chosen at generation
-- time — a start (default: now) and a length in hours — instead of a fixed
-- 12 h from generation. The code can be redeemed any time before the window
-- ends; the feed is served only from starts_at.
alter table public.public_live_access_codes
  add column if not exists starts_at timestamptz not null default now();
comment on column public.public_live_access_codes.starts_at is
  'When the watch session goes live; the code can be redeemed any time before code_expires_at but the feed is served only from starts_at.';
comment on table public.public_live_access_codes is
  'One-time passcodes for the public live chromatogram viewer (/live). A watch session is a fixed window [starts_at, code_expires_at] chosen when the code is generated; redeeming turns the code into a session token for that window. Hashes only.';
