-- Track A5: link a run_list_items row (a single sequence injection) to the
-- standard_preparation_logs row that backed it — e.g. which standard bottle
-- was used for a given ICV/CCV calibration injection. Mirrors the
-- sp_preparation_record_id pattern already used for sample-side prep links.
ALTER TABLE public.run_list_items
  ADD COLUMN IF NOT EXISTS standard_prep_id uuid REFERENCES public.standard_preparation_logs(id);
CREATE INDEX IF NOT EXISTS idx_run_list_items_standard_prep_id
  ON public.run_list_items(standard_prep_id) WHERE standard_prep_id IS NOT NULL;
