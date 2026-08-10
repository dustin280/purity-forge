ALTER TABLE public.inventory_items
  RENAME COLUMN drive_folder_id TO drive_sequences_folder_id;
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS drive_methods_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_reports_folder_id text;

ALTER TABLE public.openlab_methods
  ADD COLUMN IF NOT EXISTS instrument_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL;
ALTER TABLE public.openlab_sequences
  ADD COLUMN IF NOT EXISTS instrument_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL;
ALTER TABLE public.openlab_reports
  ADD COLUMN IF NOT EXISTS instrument_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL;

ALTER TABLE public.openlab_methods DROP CONSTRAINT IF EXISTS openlab_methods_name_key;
ALTER TABLE public.openlab_methods ADD CONSTRAINT openlab_methods_instrument_name_key UNIQUE (instrument_id, name);

ALTER TABLE public.openlab_sequences DROP CONSTRAINT IF EXISTS openlab_sequences_name_key;
ALTER TABLE public.openlab_sequences ADD CONSTRAINT openlab_sequences_instrument_name_key UNIQUE (instrument_id, name);

CREATE INDEX IF NOT EXISTS openlab_methods_instrument_id_idx ON public.openlab_methods (instrument_id);
CREATE INDEX IF NOT EXISTS openlab_sequences_instrument_id_idx ON public.openlab_sequences (instrument_id);
CREATE INDEX IF NOT EXISTS openlab_reports_instrument_id_idx ON public.openlab_reports (instrument_id);