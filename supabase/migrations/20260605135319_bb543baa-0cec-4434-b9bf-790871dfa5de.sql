-- 1. Samples: prep flag
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS prep_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prep_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_flagged_by uuid;
CREATE INDEX IF NOT EXISTS idx_samples_prep_flag ON public.samples(prep_flag) WHERE prep_flag = true;

-- 2. Run list column sources enum
DO $$ BEGIN
  CREATE TYPE public.run_list_column_source AS ENUM ('literal','sample_field','method','vial','data_file_pattern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. run_list_columns (admin-managed CSV header set)
CREATE TABLE public.run_list_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  source public.run_list_column_source NOT NULL DEFAULT 'literal',
  default_value text,
  sample_field text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_list_columns TO authenticated;
GRANT ALL ON public.run_list_columns TO service_role;
ALTER TABLE public.run_list_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rlc_select" ON public.run_list_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "rlc_admin" ON public.run_list_columns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_rlc_updated_at BEFORE UPDATE ON public.run_list_columns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. run_lists
CREATE TABLE public.run_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  instrument_id uuid REFERENCES public.instruments(id) ON DELETE SET NULL,
  method_name text,
  starting_vial integer NOT NULL DEFAULT 1,
  inj_per_vial integer NOT NULL DEFAULT 1,
  data_file_pattern text NOT NULL DEFAULT '{sample}_{yyyyMMdd}_{seq}',
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','exported')),
  exported_at timestamptz,
  exported_by uuid,
  csv_storage_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_lists TO authenticated;
GRANT ALL ON public.run_lists TO service_role;
ALTER TABLE public.run_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rl_select" ON public.run_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "rl_insert" ON public.run_lists FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rl_update" ON public.run_lists FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rl_delete" ON public.run_lists FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_rl_updated_at BEFORE UPDATE ON public.run_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. run_list_items
CREATE TABLE public.run_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_list_id uuid NOT NULL REFERENCES public.run_lists(id) ON DELETE CASCADE,
  sample_id uuid REFERENCES public.samples(id) ON DELETE SET NULL,
  row_no integer NOT NULL DEFAULT 1,
  sample_type text NOT NULL DEFAULT 'Sample',
  method_override text,
  vial integer,
  data_file text,
  comment text,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_run_list_items_list ON public.run_list_items(run_list_id, row_no);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_list_items TO authenticated;
GRANT ALL ON public.run_list_items TO service_role;
ALTER TABLE public.run_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rli_select" ON public.run_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "rli_insert" ON public.run_list_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rli_update" ON public.run_list_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rli_delete" ON public.run_list_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_rli_updated_at BEFORE UPDATE ON public.run_list_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Seed default OpenLab CDS columns
INSERT INTO public.run_list_columns (key,label,source,default_value,sample_field,sort_order) VALUES
  ('Sample Name','Sample Name','sample_field',NULL,'batch_id',10),
  ('Sample Type','Sample Type','literal','Sample',NULL,20),
  ('Method','Method','method',NULL,NULL,30),
  ('Inj/Vial','Inj/Vial','literal','1',NULL,40),
  ('Vial','Vial','vial',NULL,NULL,50),
  ('Data File','Data File','data_file_pattern',NULL,NULL,60),
  ('Sample Info','Sample Info','sample_field',NULL,'client',70),
  ('Level','Level','literal','',NULL,80),
  ('Sample Amount','Sample Amount','literal','1',NULL,90),
  ('ISTD Amount','ISTD Amount','literal','1',NULL,100),
  ('Multiplier','Multiplier','literal','1',NULL,110),
  ('Dilution','Dilution','literal','1',NULL,120),
  ('Comment','Comment','literal','',NULL,130)
ON CONFLICT (key) DO NOTHING;