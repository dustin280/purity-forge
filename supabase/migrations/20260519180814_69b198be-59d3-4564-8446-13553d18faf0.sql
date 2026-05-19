
-- 1. Drop old simple log table (and its dependents in other tables)
ALTER TABLE public.sample_prep_logs DROP COLUMN IF EXISTS material_receipt_id;
ALTER TABLE public.reagent_prep_logs DROP COLUMN IF EXISTS material_receipt_id;
ALTER TABLE public.qc_prep_logs DROP COLUMN IF EXISTS material_receipt_id;

DROP TABLE IF EXISTS public.standard_prep_logs CASCADE;
DROP TABLE IF EXISTS public.reagent_prep_logs CASCADE;
DROP TABLE IF EXISTS public.sample_prep_logs CASCADE;
DROP TABLE IF EXISTS public.qc_prep_logs CASCADE;

-- 2. Status enum for approval workflow
DO $$ BEGIN
  CREATE TYPE public.standard_prep_status AS ENUM ('draft','reviewed','approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Counter + ID generator
CREATE TABLE IF NOT EXISTS public.standard_preparation_counters (
  day date PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_standard_preparation_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := (now() AT TIME ZONE 'UTC')::date;
  n int;
BEGIN
  INSERT INTO public.standard_preparation_counters(day, last_seq)
  VALUES (d, 1)
  ON CONFLICT (day) DO UPDATE SET last_seq = standard_preparation_counters.last_seq + 1
  RETURNING last_seq INTO n;
  RETURN 'STD-PREP-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 3, '0');
END;
$$;

-- 4. Main table
CREATE TABLE public.standard_preparation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_number text NOT NULL UNIQUE DEFAULT public.next_standard_preparation_number(),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  analyst_id uuid,
  analyst_name text NOT NULL,
  standard_name text NOT NULL,
  material_receipt_id uuid REFERENCES public.material_receipts(id) ON DELETE SET NULL,
  manufacturer_lot text,
  target_concentration text,
  final_volume text,
  solvent text,
  preparation_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  mixing_details text,
  appearance_notes text,
  expiration_date date,
  storage_condition text,
  storage_location text,
  container_label text,
  status public.standard_prep_status NOT NULL DEFAULT 'draft',
  reviewer_id uuid,
  reviewer_name text,
  reviewed_at timestamptz,
  approver_id uuid,
  approver_name text,
  approved_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_std_prep_logs_prepared_at ON public.standard_preparation_logs(prepared_at DESC);
CREATE INDEX idx_std_prep_logs_receipt ON public.standard_preparation_logs(material_receipt_id);
CREATE INDEX idx_std_prep_logs_status ON public.standard_preparation_logs(status);

CREATE TRIGGER std_prep_logs_updated_at
BEFORE UPDATE ON public.standard_preparation_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER std_prep_logs_audit
AFTER INSERT OR UPDATE OR DELETE ON public.standard_preparation_logs
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

ALTER TABLE public.standard_preparation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY spl_select ON public.standard_preparation_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY spl_insert ON public.standard_preparation_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));
CREATE POLICY spl_update ON public.standard_preparation_logs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));
CREATE POLICY spl_delete ON public.standard_preparation_logs FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- 5. Attachments
DO $$ BEGIN
  CREATE TYPE public.standard_prep_attachment_kind AS ENUM
    ('weighing','label','photo','sequence','coa','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.standard_preparation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.standard_preparation_logs(id) ON DELETE CASCADE,
  kind public.standard_prep_attachment_kind NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_std_prep_att_log ON public.standard_preparation_attachments(log_id);

ALTER TABLE public.standard_preparation_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY spa_select ON public.standard_preparation_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY spa_insert ON public.standard_preparation_attachments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));
CREATE POLICY spa_delete ON public.standard_preparation_attachments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));

-- 6. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('standard-preparations','standard-preparations', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "std_prep_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'standard-preparations');
CREATE POLICY "std_prep_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'standard-preparations'
    AND (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin')));
CREATE POLICY "std_prep_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'standard-preparations'
    AND (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin')));

-- 7. Suggestions
CREATE TABLE public.standard_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  typical_concentration text,
  typical_solvent text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.standard_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_select ON public.standard_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY ss_admin ON public.standard_suggestions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

INSERT INTO public.standard_suggestions (name, typical_concentration, typical_solvent) VALUES
  ('Peptide Reference Standard','1.0 mg/mL','Water:Acetonitrile (50:50) + 0.1% TFA'),
  ('System Suitability Standard','0.5 mg/mL','Water:Acetonitrile (80:20) + 0.1% TFA'),
  ('Check Standard','0.25 mg/mL','Water:Acetonitrile (80:20) + 0.1% TFA'),
  ('Working Solution','0.1 mg/mL','Mobile phase A'),
  ('Caffeine USP RS','1.0 mg/mL','Water'),
  ('Acetanilide USP RS','0.5 mg/mL','Methanol'),
  ('Bradykinin Acetate','0.5 mg/mL','0.1% TFA in water'),
  ('Angiotensin II','0.5 mg/mL','0.1% TFA in water'),
  ('Insulin Reference Standard','1.0 mg/mL','0.01N HCl'),
  ('Glucagon Reference Standard','1.0 mg/mL','0.01N HCl')
ON CONFLICT (name) DO NOTHING;
