-- Simplify Sample Prep: decouple dilution planning from the unused
-- sp_analyte / sp_method / sp_method_revision approval chain (zero
-- compounds were linked to an analyte, zero method revisions were ever
-- approved). That apparatus is kept in place for later, not dropped.
--
-- Prep generation now reads a per-compound 6-point calibration set
-- (matches the lab's real height-verified standard curves) with a global
-- fallback range/diluent/volumes on sp_settings for anything not yet
-- calibrated.

ALTER TABLE compounds
  ADD COLUMN IF NOT EXISTS cal_l1_mg_per_ml numeric,
  ADD COLUMN IF NOT EXISTS cal_l2_mg_per_ml numeric,
  ADD COLUMN IF NOT EXISTS cal_l3_mg_per_ml numeric,
  ADD COLUMN IF NOT EXISTS cal_l4_mg_per_ml numeric,
  ADD COLUMN IF NOT EXISTS cal_l5_mg_per_ml numeric,
  ADD COLUMN IF NOT EXISTS cal_l6_mg_per_ml numeric,
  ADD COLUMN IF NOT EXISTS default_diluent_name text;

ALTER TABLE sp_settings
  ADD COLUMN IF NOT EXISTS default_cal_min_mg_per_ml numeric DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS default_cal_max_mg_per_ml numeric DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS default_diluent_name text DEFAULT 'Mobile Phase A',
  ADD COLUMN IF NOT EXISTS default_final_volume_ul numeric DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS default_reconstitution_volume_ul numeric DEFAULT 1000;

-- Prep records no longer require a method revision.
ALTER TABLE sp_preparation_records
  ALTER COLUMN method_revision_id DROP NOT NULL,
  ALTER COLUMN analyte_id DROP NOT NULL;
