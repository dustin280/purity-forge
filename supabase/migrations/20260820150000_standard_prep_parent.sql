-- Track A1: Working Standard flow needs to chain back to the primary it was
-- diluted from, so the traceability chain reaches the vendor lot.
ALTER TABLE public.standard_preparation_logs
  ADD COLUMN IF NOT EXISTS parent_prep_id uuid REFERENCES public.standard_preparation_logs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS standard_preparation_logs_parent_prep_id_idx
  ON public.standard_preparation_logs(parent_prep_id);
