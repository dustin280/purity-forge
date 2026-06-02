
ALTER TABLE public.material_receipts
  ADD COLUMN IF NOT EXISTS unit_price numeric(14,4),
  ADD COLUMN IF NOT EXISTS total_price numeric(14,2),
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS gl_account text,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS shipping_cost numeric(14,2);

CREATE INDEX IF NOT EXISTS idx_material_receipts_invoice_date
  ON public.material_receipts (invoice_date);
