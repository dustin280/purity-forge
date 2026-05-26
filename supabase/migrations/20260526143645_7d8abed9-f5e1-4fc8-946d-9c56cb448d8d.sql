
-- Reagents lookup
CREATE TABLE public.mobile_phase_reagents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  kinds text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobile_phase_reagents TO authenticated;
GRANT ALL ON public.mobile_phase_reagents TO service_role;

ALTER TABLE public.mobile_phase_reagents ENABLE ROW LEVEL SECURITY;

CREATE POLICY mpr_select ON public.mobile_phase_reagents FOR SELECT TO authenticated USING (true);
CREATE POLICY mpr_admin ON public.mobile_phase_reagents FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER mpr_set_updated_at BEFORE UPDATE ON public.mobile_phase_reagents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Counter + ID function
CREATE TABLE public.mobile_phase_prep_counters (
  day date NOT NULL PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_mobile_phase_prep_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d date := (now() AT TIME ZONE 'UTC')::date;
  n int;
BEGIN
  INSERT INTO public.mobile_phase_prep_counters(day, last_seq)
  VALUES (d, 1)
  ON CONFLICT (day) DO UPDATE SET last_seq = mobile_phase_prep_counters.last_seq + 1
  RETURNING last_seq INTO n;
  RETURN 'MP-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 3, '0');
END;
$$;

-- Prep logs
CREATE TABLE public.mobile_phase_prep_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  log_number text NOT NULL DEFAULT next_mobile_phase_prep_number(),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_name text NOT NULL,
  user_initials text NOT NULL,
  lot_number text NOT NULL,
  total_volume numeric NOT NULL,
  total_volume_unit text NOT NULL DEFAULT 'mL',
  prep_a jsonb NOT NULL DEFAULT '{"enabled":false}'::jsonb,
  prep_b jsonb NOT NULL DEFAULT '{"enabled":false}'::jsonb,
  preparation text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobile_phase_prep_logs TO authenticated;
GRANT ALL ON public.mobile_phase_prep_logs TO service_role;

ALTER TABLE public.mobile_phase_prep_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY mppl_select ON public.mobile_phase_prep_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY mppl_insert ON public.mobile_phase_prep_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'tech'::app_role) OR has_role(auth.uid(),'reviewer'::app_role) OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY mppl_update ON public.mobile_phase_prep_logs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR created_by = auth.uid());

CREATE POLICY mppl_delete ON public.mobile_phase_prep_logs FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER mppl_set_updated_at BEFORE UPDATE ON public.mobile_phase_prep_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER mppl_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.mobile_phase_prep_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Seed reagents
INSERT INTO public.mobile_phase_reagents (name, kinds, sort_order) VALUES
  ('Acetonitrile (ACN)', ARRAY['solvent','diluent'], 10),
  ('Methanol', ARRAY['solvent','diluent'], 20),
  ('Ethanol', ARRAY['solvent','diluent'], 30),
  ('Isopropyl Alcohol (IPA)', ARRAY['solvent','diluent'], 40),
  ('HPLC Water', ARRAY['solvent','diluent'], 50),
  ('Low TOC Reagent Water', ARRAY['solvent','diluent'], 60),
  ('Trifluoroacetic Acid (TFA)', ARRAY['modifier'], 100),
  ('Formic Acid (FA)', ARRAY['modifier'], 110);
