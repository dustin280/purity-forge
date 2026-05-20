
-- 1. Material receipts: add reference fields
ALTER TABLE public.material_receipts
  ADD COLUMN IF NOT EXISTS purity_percent numeric,
  ADD COLUMN IF NOT EXISTS molecular_weight numeric,
  ADD COLUMN IF NOT EXISTS shelf_life_months integer;

-- 2. Standard preparation logs: calculator + snapshot fields
ALTER TABLE public.standard_preparation_logs
  ADD COLUMN IF NOT EXISTS expiration_period_code text,
  ADD COLUMN IF NOT EXISTS expiration_period_days integer,
  ADD COLUMN IF NOT EXISTS initial_solvent text,
  ADD COLUMN IF NOT EXISTS final_diluent text,
  ADD COLUMN IF NOT EXISTS modifier_percent numeric,
  ADD COLUMN IF NOT EXISTS material_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ref_material_name text,
  ADD COLUMN IF NOT EXISTS ref_lot text,
  ADD COLUMN IF NOT EXISTS ref_purity_percent numeric,
  ADD COLUMN IF NOT EXISTS ref_molecular_weight numeric,
  ADD COLUMN IF NOT EXISTS ref_receipt_date date;

-- 3. Targets table
CREATE TABLE IF NOT EXISTS public.standard_preparation_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_id uuid NOT NULL REFERENCES public.standard_preparation_logs(id) ON DELETE CASCADE,
  row_no integer NOT NULL,
  name text,
  target_concentration_mg_per_ml numeric,
  target_volume_ml numeric,
  calculated_mass_mg numeric,
  calculated_volume_ml numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spt_prep_id ON public.standard_preparation_targets(prep_id);

ALTER TABLE public.standard_preparation_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spt_select ON public.standard_preparation_targets;
CREATE POLICY spt_select ON public.standard_preparation_targets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS spt_insert ON public.standard_preparation_targets;
CREATE POLICY spt_insert ON public.standard_preparation_targets
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'tech'::app_role)
    OR has_role(auth.uid(), 'reviewer'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS spt_update ON public.standard_preparation_targets;
CREATE POLICY spt_update ON public.standard_preparation_targets
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'tech'::app_role)
    OR has_role(auth.uid(), 'reviewer'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS spt_delete ON public.standard_preparation_targets;
CREATE POLICY spt_delete ON public.standard_preparation_targets
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'tech'::app_role)
    OR has_role(auth.uid(), 'reviewer'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
