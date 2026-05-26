CREATE TABLE public.compounds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX compounds_name_lower_unique ON public.compounds (lower(name));

ALTER TABLE public.compounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY compounds_select ON public.compounds
  FOR SELECT TO authenticated USING (true);

CREATE POLICY compounds_insert ON public.compounds
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'tech'::app_role)
    OR has_role(auth.uid(), 'reviewer'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY compounds_update_admin ON public.compounds
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY compounds_delete_admin ON public.compounds
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER compounds_set_updated_at
  BEFORE UPDATE ON public.compounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.compounds (name) VALUES
  ('TB500 (Thymosin β4 fragment)'),
  ('Ipamorelin'),
  ('BPC-157 Acetate'),
  ('Semax'),
  ('SS-31 (Elamipritide)'),
  ('Melanotan (MT-II)'),
  ('NAD (NAD+)'),
  ('Glutathione'),
  ('Tesamorelin'),
  ('Retatrutide'),
  ('GHK-Cu'),
  ('Tirzepatide'),
  ('Semaglutide'),
  ('Selank'),
  ('Cagrilintide'),
  ('Sermorelin'),
  ('Tadalafil'),
  ('Epitalon'),
  ('Pinealon'),
  ('CJC-1295'),
  ('KPV'),
  ('PT-141 (Bremelanotide)'),
  ('BPC-157 (free)'),
  ('MOTS-C'),
  ('Thymosin Beta 4');