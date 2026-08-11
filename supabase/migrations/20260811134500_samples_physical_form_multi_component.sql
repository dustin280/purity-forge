-- Sample Receipt now captures physical form (solid/liquid/capsule) and
-- label content instead of the old free-text quantity/concentration/purity
-- fields, plus optional multi-compound blend composition (e.g. "KLOW" =
-- BPC-157 + TB-500 + KPV + GHK-Cu). The primary compound stays in the
-- existing compound/compound_id columns so downstream code (method_group_id
-- derivation, Sample Prep analyte resolution) is unaffected; `components`
-- holds every additional compound in the blend.
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS physical_form text,
  ADD COLUMN IF NOT EXISTS label_content_value numeric,
  ADD COLUMN IF NOT EXISTS label_content_unit text,
  ADD COLUMN IF NOT EXISTS is_multi_component boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS components jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS physical_form_details jsonb;

ALTER TABLE public.samples
  DROP CONSTRAINT IF EXISTS samples_physical_form_check;
ALTER TABLE public.samples
  ADD CONSTRAINT samples_physical_form_check
  CHECK (physical_form IS NULL OR physical_form IN ('solid', 'liquid', 'capsule'));
