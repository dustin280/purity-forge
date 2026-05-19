
CREATE TYPE coc_field_type AS ENUM ('text', 'textarea', 'number', 'date', 'datetime', 'email', 'tel');

CREATE TABLE public.chain_of_custody_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type coc_field_type NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  placeholder text,
  options jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chain_of_custody_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coc_records_sample ON public.chain_of_custody_records(sample_id);
CREATE INDEX idx_coc_fields_order ON public.chain_of_custody_fields(sort_order);

ALTER TABLE public.chain_of_custody_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY coc_fields_select ON public.chain_of_custody_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY coc_fields_admin ON public.chain_of_custody_fields FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY coc_records_select ON public.chain_of_custody_records FOR SELECT TO authenticated USING (true);
CREATE POLICY coc_records_insert ON public.chain_of_custody_records FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'admin'));
CREATE POLICY coc_records_update ON public.chain_of_custody_records FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));
CREATE POLICY coc_records_delete ON public.chain_of_custody_records FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_coc_fields_updated BEFORE UPDATE ON public.chain_of_custody_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_coc_records_updated BEFORE UPDATE ON public.chain_of_custody_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.chain_of_custody_fields (field_key, label, field_type, is_required, sort_order) VALUES
  ('sample_id', 'Sample ID', 'text', true, 10),
  ('receipt_datetime', 'Date and Time of Receipt', 'datetime', true, 20),
  ('receiving_lab', 'Receiving Lab / Facility Name', 'text', true, 30),
  ('receiver_name', 'Receiver''s Full Name', 'text', true, 40),
  ('client_company', 'Client Company Name', 'text', true, 50),
  ('client_contact_name', 'Client Contact Person Name', 'text', false, 60),
  ('client_contact_email', 'Client Contact Email', 'email', false, 70),
  ('client_contact_phone', 'Client Contact Phone', 'tel', false, 80),
  ('client_received_date', 'Client Received Date', 'date', false, 90),
  ('manufacturer_name', 'Manufacturer Name', 'text', false, 100),
  ('manufacture_date', 'Manufacture Date', 'date', false, 110),
  ('product_name', 'Product Name', 'text', true, 120),
  ('catalog_code', 'Catalog / Product Code', 'text', false, 130),
  ('lot_batch_number', 'Lot / Batch Number', 'text', true, 140),
  ('quantity_received', 'Quantity Received (vials, mg, etc.)', 'text', true, 150),
  ('container_size', 'Container Size / Concentration per Vial', 'text', false, 160),
  ('physical_description', 'Physical Description (lyophilized powder, liquid, color, etc.)', 'textarea', false, 170),
  ('packaging_condition', 'Packaging Condition upon Receipt (intact, damaged, sealed, etc.)', 'textarea', false, 180),
  ('shipping_method', 'Shipping Method', 'text', false, 190),
  ('tracking_number', 'Tracking / Air Waybill Number', 'text', false, 200),
  ('shipment_date', 'Date of Shipment', 'date', false, 210),
  ('temperature_condition', 'Temperature Condition upon Receipt (ambient, cold chain, frozen)', 'text', false, 220),
  ('observed_issues', 'Any Observed Issues or Deviations', 'textarea', false, 230),
  ('purpose_of_testing', 'Purpose of Testing (Purity, Identity, Impurities, etc.)', 'textarea', false, 240),
  ('requested_tests', 'Requested Tests', 'textarea', false, 250),
  ('storage_required', 'Storage Conditions Required (Refrigerated, Frozen, Desiccated, etc.)', 'text', false, 260),
  ('internal_storage_location', 'Internal Lab Storage Location (e.g., Freezer #, Shelf #)', 'text', false, 270),
  ('comments', 'Comments / Notes', 'textarea', false, 280);
