-- Links samples to the clients table instead of relying solely on free-text
-- `samples.client`. Additive and non-destructive: `client_id` is nullable and
-- `client` is kept (not dropped) so existing reads (COA, exports, dashboards)
-- keep working unchanged. Backfill only exact case-insensitive name matches —
-- rows that don't match (typos, since-renamed clients) are left with
-- client_id = NULL rather than guessed at; reconciling those is a data
-- decision for whoever owns the client list, not something to auto-resolve
-- here.
ALTER TABLE public.samples
  ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

UPDATE public.samples s
SET client_id = c.id
FROM public.clients c
WHERE s.client_id IS NULL
  AND lower(trim(s.client)) = lower(trim(c.company_name));

CREATE INDEX idx_samples_client_id ON public.samples(client_id);
