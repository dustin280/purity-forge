-- Endotoxin result entry becomes a direct pass/fail assertion instead of a
-- numeric-vs-limit comparison -- the per-product limit was highly variable
-- and never reported on the COA. Assay sensitivity replaces it as the fixed
-- reference value, but it's a permanent lab-wide setting (this column),
-- not something entered with each result.
alter table sp_settings
  add column if not exists endotoxin_assay_sensitivity_eu_per_ml numeric default 0.01;

update sp_settings set endotoxin_assay_sensitivity_eu_per_ml = 0.01 where endotoxin_assay_sensitivity_eu_per_ml is null;
