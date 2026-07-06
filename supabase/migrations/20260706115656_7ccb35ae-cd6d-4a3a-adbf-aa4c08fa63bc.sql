
CREATE TABLE public.pending_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_order_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','cancelled')),
  order_date timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  customer_name text,
  customer_email text,
  customer_company text,
  customer_external_id text,
  tracking_number text,
  carrier text,
  expected_arrival date,
  total_samples int,
  special_instructions text,
  raw_payload jsonb NOT NULL,
  linked_coc_id uuid REFERENCES public.chain_of_custody_records(id) ON DELETE SET NULL,
  received_by uuid,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_orders TO authenticated;
GRANT ALL ON public.pending_orders TO service_role;

ALTER TABLE public.pending_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_orders_select" ON public.pending_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "pending_orders_update" ON public.pending_orders FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));
CREATE POLICY "pending_orders_insert" ON public.pending_orders FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "pending_orders_delete" ON public.pending_orders FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_pending_orders_updated BEFORE UPDATE ON public.pending_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pending_orders_status ON public.pending_orders(status, created_at DESC);

CREATE TABLE public.pending_order_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_order_id uuid NOT NULL REFERENCES public.pending_orders(id) ON DELETE CASCADE,
  line_index int NOT NULL,
  external_sample_id text,
  product_name text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  lot_batch text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_order_samples TO authenticated;
GRANT ALL ON public.pending_order_samples TO service_role;

ALTER TABLE public.pending_order_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_order_samples_select" ON public.pending_order_samples FOR SELECT TO authenticated USING (true);
CREATE POLICY "pending_order_samples_modify" ON public.pending_order_samples FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE INDEX idx_pending_order_samples_order ON public.pending_order_samples(pending_order_id, line_index);
