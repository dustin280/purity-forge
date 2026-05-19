
CREATE TABLE public.test_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.test_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_parameters_select_auth" ON public.test_parameters
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "test_parameters_admin_all" ON public.test_parameters
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER test_parameters_updated_at
  BEFORE UPDATE ON public.test_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS parameters text[] NOT NULL DEFAULT '{}';

INSERT INTO public.test_parameters (name) VALUES
  ('BPC-157'),('TB-500'),('Semaglutide'),('Tirzepatide'),('CJC-1295'),
  ('Ipamorelin'),('GHK-Cu'),('Sermorelin'),('AOD-9604'),('Tesamorelin'),
  ('Retatrutide'),('PT-141'),('Melanotan 2'),('Selank'),('Semax'),
  ('Thymosin Alpha-1'),('IGF-1 LR3'),('Fragment 176-191'),('GHRP-2'),('GHRP-6'),
  ('Epitalon'),('DSIP'),('Pinealon'),('Cortagen'),('MOTS-c'),
  ('SS-31'),('Humanin'),('KPV'),('Cerebrolysin'),('Dihexa'),
  ('Kisspeptin'),('Gonadorelin'),('Tesofensine'),('5-Amino-1MQ'),('Liraglutide'),
  ('MK-677'),('Thymosin Beta-4'),('FOXO4-DRI'),('ARA-290'),('LL-37'),
  ('Collagen peptides'),('Matrixyl'),('Argireline'),('SNAP-8'),('Pal-GHK'),
  ('CagriSema'),('BPC-157 + TB-500 blend'),('CJC-1295 + Ipamorelin blend'),('NAD+')
ON CONFLICT (name) DO NOTHING;
