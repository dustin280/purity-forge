
-- New sample status values (must be added; cannot be used in the same tx)
ALTER TYPE sample_status ADD VALUE IF NOT EXISTS 'intake_verified';
ALTER TYPE sample_status ADD VALUE IF NOT EXISTS 'prep';
ALTER TYPE sample_status ADD VALUE IF NOT EXISTS 'complete';

-- Per-sample CoC linkage and identity
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS coc_id uuid REFERENCES public.chain_of_custody_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coc_line_no integer,
  ADD COLUMN IF NOT EXISTS compound text,
  ADD COLUMN IF NOT EXISTS lot text;

CREATE INDEX IF NOT EXISTS samples_coc_id_idx ON public.samples (coc_id);
CREATE INDEX IF NOT EXISTS samples_status_idx ON public.samples (status);

-- Repeatable line items captured on the CoC form
ALTER TABLE public.chain_of_custody_records
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
