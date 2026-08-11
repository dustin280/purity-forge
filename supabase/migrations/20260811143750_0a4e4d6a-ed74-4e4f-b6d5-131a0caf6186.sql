-- Migration 1
-- Client contact info at Sample Receipt was optional, which let intake
-- through with no way to reach the client for follow-up questions on a
-- sample. Require the same three fields that already auto-fill from the
-- client picker.
UPDATE public.chain_of_custody_fields
SET is_required = true
WHERE field_key IN ('client_contact_name', 'client_contact_email', 'client_contact_phone');

-- Migration 2
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

-- Migration 3
-- Results entry needs a Drive folder to pick completed instrument report
-- PDFs from. Reuses the existing lab-settings singleton (sp_settings)
-- rather than a new table, same as the LM-SamplePrep folder before it.
ALTER TABLE public.sp_settings
  ADD COLUMN IF NOT EXISTS drive_lm_reports_complete_folder_id text;