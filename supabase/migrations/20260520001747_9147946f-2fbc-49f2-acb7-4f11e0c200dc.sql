
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS client_received_date date,
  ADD COLUMN IF NOT EXISTS manufacture_date date,
  ADD COLUMN IF NOT EXISTS physical_description text;

UPDATE public.chain_of_custody_fields
  SET is_active = false
  WHERE field_key IN ('client_received_date','manufacturer_name','manufacture_date','physical_description');
