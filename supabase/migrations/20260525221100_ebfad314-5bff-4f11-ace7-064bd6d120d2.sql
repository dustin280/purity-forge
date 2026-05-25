ALTER TABLE public.standard_preparation_logs
  ADD COLUMN IF NOT EXISTS ref_form text NOT NULL DEFAULT 'solid',
  ADD COLUMN IF NOT EXISTS ref_concentration_mg_per_ml numeric;

ALTER TABLE public.standard_preparation_logs
  ADD CONSTRAINT standard_preparation_logs_ref_form_check
  CHECK (ref_form IN ('solid','liquid'));