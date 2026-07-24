ALTER TABLE public.run_list_items
  ADD COLUMN IF NOT EXISTS sp_preparation_record_id uuid
  REFERENCES public.sp_preparation_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS run_list_items_sp_prep_record_idx
  ON public.run_list_items(sp_preparation_record_id);