-- 1. Fix the lab ID generator to match the real batch_id convention
-- (SYX-NNNNNN, confirmed against live data) instead of the current
-- COC-MMDDYY-N scheme. Kept as the same function name/signature so every
-- existing call site (auto-fill in the CoC form, nextCocInvoiceNumber)
-- needs no code changes. Seeded at 5 — the current real max is SYX-000005.
CREATE TABLE public.syx_batch_id_counter (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_number bigint NOT NULL
);
INSERT INTO public.syx_batch_id_counter (id, last_number) VALUES (1, 5);
GRANT SELECT ON public.syx_batch_id_counter TO authenticated;
GRANT ALL ON public.syx_batch_id_counter TO service_role;
ALTER TABLE public.syx_batch_id_counter ENABLE ROW LEVEL SECURITY;
CREATE POLICY syx_batch_id_counter_admin ON public.syx_batch_id_counter
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.next_coc_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  UPDATE public.syx_batch_id_counter SET last_number = last_number + 1 WHERE id = 1
  RETURNING last_number INTO n;
  RETURN 'SYX-' || lpad(n::text, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_coc_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_coc_invoice_number() TO authenticated;

-- 2. Reserve a real lab ID for a pending order before it's actually
-- received, so label printing and the receive form always agree.
ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS reserved_sample_id text;

-- 3. Preserve the partner's raw compound name independent of whatever the
-- compound picker ends up set to, so discrepancies can be reconciled later.
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS partner_reported_compound_name text;
