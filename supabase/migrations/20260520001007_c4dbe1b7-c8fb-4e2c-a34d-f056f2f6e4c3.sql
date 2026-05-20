ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS temperature_c numeric,
  ADD COLUMN IF NOT EXISTS line_item_index integer;

ALTER TABLE public.coc_attachments
  ADD COLUMN IF NOT EXISTS line_item_index integer;

CREATE INDEX IF NOT EXISTS coc_attachments_coc_line_idx
  ON public.coc_attachments(coc_id, line_item_index);