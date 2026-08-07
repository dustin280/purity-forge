ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS samples_client_id_idx ON public.samples(client_id);
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS spec_min numeric;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS spec_max numeric;