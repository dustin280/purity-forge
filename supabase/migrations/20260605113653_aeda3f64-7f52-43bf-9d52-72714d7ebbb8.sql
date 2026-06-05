CREATE TABLE public.hplc_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  part_number text,
  source_receipt_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hplc_columns TO authenticated;
GRANT ALL ON public.hplc_columns TO service_role;

ALTER TABLE public.hplc_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY hc_select ON public.hplc_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY hc_insert ON public.hplc_columns FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY hc_update ON public.hplc_columns FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY hc_delete ON public.hplc_columns FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER hplc_columns_updated_at BEFORE UPDATE ON public.hplc_columns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.hplc_columns (name, part_number) VALUES
  ('AdvanceBio Peptide Plus 3.0 x 150 mm, 2.7 µm', '693975-349'),
  ('Altura ZORBAX Eclipse Plus C18 1.8 µm, 2.1x50 mm', '204205-308'),
  ('Altura ZORBAX Eclipse Plus C18 1.8 µm, 2.1x150 mm', '204215-308');
