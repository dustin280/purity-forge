-- Multi-analyte test support: sterility, endotoxin, heavy metals (bioburden
-- later). Adds a stable test_type enum on `tests` — this is also the stable
-- category field the partner API consumer asked for, distinct from the
-- freely-renamable `method_name`. Never rename/remove a value once shipped.
CREATE TYPE public.test_type AS ENUM ('purity', 'sterility', 'endotoxin', 'heavy_metals');

ALTER TABLE public.tests ADD COLUMN test_type public.test_type NOT NULL DEFAULT 'purity';
ALTER TABLE public.tests ADD COLUMN sub_id text; -- e.g. "SYX-000005-04-ST", null for purity

-- Routes an admin-editable "requested tests" flag (test_parameters.name,
-- freely renamable) to a stable test_type, so renaming "Heavy Metals" to
-- anything else never breaks which tests get auto-provisioned at intake.
ALTER TABLE public.test_parameters ADD COLUMN maps_to_test_type public.test_type;

INSERT INTO public.test_parameters (name, maps_to_test_type) VALUES
  ('Sterility', 'sterility'), ('Endotoxin', 'endotoxin'), ('Heavy Metals', 'heavy_metals')
ON CONFLICT (name) DO UPDATE SET maps_to_test_type = EXCLUDED.maps_to_test_type;

-- One shared results table for every non-chromatography test type. Sterility
-- and endotoxin go through Micro's own independent review process before
-- ever reaching Lab Manager, and heavy metals (outsourced for now) is
-- already reviewed by the outside lab before it's transcribed here — so
-- unlike `results`, entering a row here is final, not a draft awaiting
-- in-app review. reviewer_id/reviewed_at/approved_at are still included
-- (unused today) so an eventual full in-app Micro review workflow doesn't
-- need a schema migration to add them later.
CREATE TABLE public.nonchrom_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  test_type public.test_type NOT NULL CHECK (test_type <> 'purity'),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_date timestamptz NOT NULL DEFAULT now(),
  analyst_id uuid REFERENCES auth.users(id),
  reviewer_id uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nonchrom_results_test_id ON public.nonchrom_results(test_id);
ALTER TABLE public.nonchrom_results ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_nonchrom_results_updated BEFORE UPDATE ON public.nonchrom_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_nonchrom_results_audit AFTER INSERT OR UPDATE OR DELETE ON public.nonchrom_results
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE POLICY "nonchrom_results_select_auth" ON public.nonchrom_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "nonchrom_results_insert_tech" ON public.nonchrom_results FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "nonchrom_results_update_staff" ON public.nonchrom_results FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));

-- Attachments (heavy-metals "attach sub report" now; any future analyte
-- later, e.g. once in-house ICP-MS lands) keyed to test_id rather than
-- nonchrom_results.id, so a report file can be dropped in the moment it
-- arrives without forcing an empty result row to exist first.
CREATE TYPE public.nonchrom_attachment_kind AS ENUM ('lab_report', 'coa', 'other');

CREATE TABLE public.nonchrom_test_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  kind public.nonchrom_attachment_kind NOT NULL DEFAULT 'lab_report',
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nonchrom_test_att_test ON public.nonchrom_test_attachments(test_id);
ALTER TABLE public.nonchrom_test_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nonchrom_test_att_select" ON public.nonchrom_test_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "nonchrom_test_att_insert" ON public.nonchrom_test_attachments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "nonchrom_test_att_delete" ON public.nonchrom_test_attachments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));

INSERT INTO storage.buckets (id, name, public) VALUES ('nonchrom-tests', 'nonchrom-tests', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "nonchrom_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'nonchrom-tests');
CREATE POLICY "nonchrom_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'nonchrom-tests' AND (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "nonchrom_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'nonchrom-tests' AND (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin')));
