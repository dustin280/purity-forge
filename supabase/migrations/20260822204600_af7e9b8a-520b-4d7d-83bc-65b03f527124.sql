CREATE TABLE public.sterility_preps (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  sample_id uuid not null references public.samples(id) on delete cascade,
  ftm_receipt_id uuid references public.material_receipts(id) on delete set null,
  ftm_lot_number text,
  tsb_receipt_id uuid references public.material_receipts(id) on delete set null,
  tsb_lot_number text,
  inoculation_volume_ml numeric not null default 1.0,
  prepared_by uuid references auth.users(id) on delete set null,
  prepared_at timestamptz not null default now(),
  interim_check_status text not null default 'pending',
  interim_check_at timestamptz,
  interim_check_by uuid references auth.users(id) on delete set null,
  interim_check_notes text,
  interim_notified_at timestamptz,
  readout_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE UNIQUE INDEX sterility_preps_test_id_key ON public.sterility_preps(test_id);
CREATE INDEX sterility_preps_sample_id_idx ON public.sterility_preps(sample_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sterility_preps TO authenticated;
GRANT ALL ON public.sterility_preps TO service_role;

ALTER TABLE public.sterility_preps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sterility_preps_select" ON public.sterility_preps FOR SELECT TO authenticated USING (true);
CREATE POLICY "sterility_preps_insert" ON public.sterility_preps FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sterility_preps_update" ON public.sterility_preps FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sterility_preps_delete" ON public.sterility_preps FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER sterility_preps_set_updated_at BEFORE UPDATE ON public.sterility_preps
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();