
-- Drop old simple table (will be replaced by the rich Material Receipt module)
DROP TABLE IF EXISTS public.material_receipt_logs CASCADE;

-- Enums
CREATE TYPE public.material_type AS ENUM ('controlled', 'uncontrolled');
CREATE TYPE public.material_quarantine_status AS ENUM ('quarantine', 'released', 'rejected');
CREATE TYPE public.material_receipt_attachment_kind AS ENUM ('coa', 'sds', 'packing_slip', 'label', 'photo', 'other');

-- Daily counter for receipt numbers
CREATE TABLE public.material_receipt_counters (
  day date PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0
);
ALTER TABLE public.material_receipt_counters ENABLE ROW LEVEL SECURITY;
-- no policies = no client access; only SECURITY DEFINER function may touch it

CREATE OR REPLACE FUNCTION public.next_material_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := (now() AT TIME ZONE 'UTC')::date;
  n int;
BEGIN
  INSERT INTO public.material_receipt_counters(day, last_seq)
  VALUES (d, 1)
  ON CONFLICT (day) DO UPDATE SET last_seq = material_receipt_counters.last_seq + 1
  RETURNING last_seq INTO n;
  RETURN 'REC-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 3, '0');
END;
$$;

-- Main table
CREATE TABLE public.material_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE DEFAULT public.next_material_receipt_number(),
  material_type public.material_type NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid,
  receiver_name text NOT NULL,
  material_name text NOT NULL,
  quantity numeric,
  unit text,
  supplier text,
  po_number text,
  notes text,
  -- uncontrolled-only
  purpose text,
  -- controlled-only
  manufacturer text,
  manufacturer_lot text,
  catalog_number text,
  expiry_date date,
  container_details text,
  coa_attached boolean NOT NULL DEFAULT false,
  sds_attached boolean NOT NULL DEFAULT false,
  visual_inspection text,
  visual_inspection_notes text,
  temperature_on_receipt numeric,
  internal_lot text,
  storage_location text,
  quarantine_status public.material_quarantine_status NOT NULL DEFAULT 'quarantine',
  qc_pass boolean,
  qc_results text,
  qc_analyst text,
  qc_date date,
  approved_at timestamptz,
  approved_by uuid,
  approver_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_mr_received_at ON public.material_receipts (received_at DESC);
CREATE INDEX idx_mr_material_type ON public.material_receipts (material_type);
CREATE INDEX idx_mr_internal_lot ON public.material_receipts (internal_lot);
CREATE INDEX idx_mr_material_name ON public.material_receipts (lower(material_name));

ALTER TABLE public.material_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY mr_select ON public.material_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY mr_insert ON public.material_receipts FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'admin'));
CREATE POLICY mr_update ON public.material_receipts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));
CREATE POLICY mr_delete ON public.material_receipts FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_mr_updated_at BEFORE UPDATE ON public.material_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mr_audit AFTER INSERT OR UPDATE OR DELETE ON public.material_receipts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Attachments table
CREATE TABLE public.material_receipt_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.material_receipts(id) ON DELETE CASCADE,
  kind public.material_receipt_attachment_kind NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mra_receipt ON public.material_receipt_attachments(receipt_id);

ALTER TABLE public.material_receipt_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mra_select ON public.material_receipt_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY mra_insert ON public.material_receipt_attachments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'reviewer'));
CREATE POLICY mra_delete ON public.material_receipt_attachments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'reviewer'));

CREATE TRIGGER trg_mra_audit AFTER INSERT OR UPDATE OR DELETE ON public.material_receipt_attachments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Linkage columns: connect future prep / instrument logs to a receipt
ALTER TABLE public.sample_prep_logs ADD COLUMN IF NOT EXISTS material_receipt_id uuid REFERENCES public.material_receipts(id) ON DELETE SET NULL;
ALTER TABLE public.qc_prep_logs ADD COLUMN IF NOT EXISTS material_receipt_id uuid REFERENCES public.material_receipts(id) ON DELETE SET NULL;
ALTER TABLE public.reagent_prep_logs ADD COLUMN IF NOT EXISTS material_receipt_id uuid REFERENCES public.material_receipts(id) ON DELETE SET NULL;
ALTER TABLE public.standard_prep_logs ADD COLUMN IF NOT EXISTS material_receipt_id uuid REFERENCES public.material_receipts(id) ON DELETE SET NULL;

-- Common controlled-material suggestions
CREATE TABLE public.material_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type public.material_type NOT NULL,
  name text NOT NULL,
  manufacturer text,
  catalog_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(material_type, name)
);
ALTER TABLE public.material_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ms_select ON public.material_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY ms_admin ON public.material_suggestions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

INSERT INTO public.material_suggestions (material_type, name, manufacturer) VALUES
  ('controlled','Acetonitrile (HPLC)','Fisher Scientific'),
  ('controlled','Methanol (HPLC)','Fisher Scientific'),
  ('controlled','Water (LC-MS)','Fisher Scientific'),
  ('controlled','Trifluoroacetic Acid','Sigma-Aldrich'),
  ('controlled','Formic Acid (LC-MS)','Sigma-Aldrich'),
  ('controlled','Peptide Reference Standard',NULL),
  ('controlled','C18 Column (Agilent ZORBAX)','Agilent'),
  ('uncontrolled','HPLC Vials (2 mL)',NULL),
  ('uncontrolled','Vial Caps / Septa',NULL),
  ('uncontrolled','Pipette Tips',NULL),
  ('uncontrolled','Nitrile Gloves',NULL);

-- Storage bucket for COA / SDS / packing slips / photos (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('material-receipts','material-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "mr_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'material-receipts');
CREATE POLICY "mr_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'material-receipts'
    AND (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin')));
CREATE POLICY "mr_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'material-receipts'
    AND (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin')));
