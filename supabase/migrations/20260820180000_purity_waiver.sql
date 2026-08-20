-- "No Purity" bypass: lets a sample (e.g. referee-lab work where only
-- Endotoxin/Heavy Metals/Sterility was requested, no purity at all) skip the
-- review/approve gate that normally requires a reviewed+approved purity
-- result. Mirrors the prep_flag/prep_flagged_at/prep_flagged_by pattern.
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS purity_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purity_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS purity_waived_by uuid;
