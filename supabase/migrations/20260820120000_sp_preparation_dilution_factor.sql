-- Promote the dilution factor to a real column on sp_preparation_records so
-- the run-list sequence generator can resolve it without reading into the
-- (inconsistently-cased) `plan` jsonb blob. Backfill from whichever casing
-- each existing row happens to carry.
ALTER TABLE public.sp_preparation_records
  ADD COLUMN IF NOT EXISTS total_dilution_factor numeric;

UPDATE public.sp_preparation_records
SET total_dilution_factor = COALESCE(
  (plan->>'totalDilutionFactor')::numeric,
  (plan->>'total_dilution_factor')::numeric
)
WHERE total_dilution_factor IS NULL;
