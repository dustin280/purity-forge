-- Real FK from samples to the compound library, replacing free-text name
-- matching as the source of truth for method_group_id and (via
-- compounds.sp_analyte_id) Sample Prep calibration linking.

ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS compound_id uuid REFERENCES public.compounds(id) ON DELETE SET NULL;
