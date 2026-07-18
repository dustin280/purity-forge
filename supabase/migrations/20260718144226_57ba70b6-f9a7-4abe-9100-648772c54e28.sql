-- Group C: Guided Standard Prep flow schema

-- 1) Extra columns on standard_preparation_logs
ALTER TABLE public.standard_preparation_logs
  ADD COLUMN IF NOT EXISTS prep_type text,
  ADD COLUMN IF NOT EXISTS diluent_solvents jsonb,
  ADD COLUMN IF NOT EXISTS modifier_type text,
  ADD COLUMN IF NOT EXISTS modifier_material_receipt_id uuid REFERENCES public.material_receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_concentration_value numeric,
  ADD COLUMN IF NOT EXISTS final_concentration_unit text,
  ADD COLUMN IF NOT EXISTS final_volume_ml numeric,
  ADD COLUMN IF NOT EXISTS preparation_instructions text;

-- 2) standard_preparation_targets
CREATE TABLE IF NOT EXISTS public.standard_preparation_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_id uuid NOT NULL REFERENCES public.standard_preparation_logs(id) ON DELETE CASCADE,
  row_no int NOT NULL DEFAULT 1,
  name text NOT NULL,
  target_concentration_mg_per_ml numeric,
  target_concentration_unit text DEFAULT 'mg/mL',
  target_volume_ml numeric,
  calculated_mass_mg numeric,
  calculated_volume_ml numeric,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.standard_preparation_targets TO authenticated;
GRANT ALL ON public.standard_preparation_targets TO service_role;
ALTER TABLE public.standard_preparation_targets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "prep_targets_select" ON public.standard_preparation_targets FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "prep_targets_insert" ON public.standard_preparation_targets FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "prep_targets_update" ON public.standard_preparation_targets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "prep_targets_delete" ON public.standard_preparation_targets FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_prep_targets_prep_id ON public.standard_preparation_targets(prep_id);

-- 3) solvent + modifier catalogs
CREATE TABLE IF NOT EXISTS public.solvent_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.solvent_options TO authenticated;
GRANT ALL ON public.solvent_options TO service_role;
ALTER TABLE public.solvent_options ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "solvent_opts_select" ON public.solvent_options FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "solvent_opts_insert" ON public.solvent_options FOR INSERT TO authenticated WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.modifier_options TO authenticated;
GRANT ALL ON public.modifier_options TO service_role;
ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "modifier_opts_select" ON public.modifier_options FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "modifier_opts_insert" ON public.modifier_options FOR INSERT TO authenticated WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.solvent_options (name) VALUES
  ('Water'), ('Methanol'), ('Acetonitrile'), ('Ethanol'), ('Isopropanol'), ('DMSO'), ('DMF'), ('THF'), ('Acetone'), ('Hexane')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.modifier_options (name) VALUES
  ('Formic acid'), ('Acetic acid'), ('TFA'), ('Ammonium formate'), ('Ammonium acetate'), ('Phosphoric acid'), ('Triethylamine')
ON CONFLICT (name) DO NOTHING;

-- 4) STDLOG lot counter for controlled material receipts
CREATE TABLE IF NOT EXISTS public.stdlog_counters (
  day date PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.stdlog_counters TO authenticated;
GRANT ALL ON public.stdlog_counters TO service_role;
ALTER TABLE public.stdlog_counters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "stdlog_counters_select" ON public.stdlog_counters FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.next_stdlog_lot()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d date := (now() AT TIME ZONE 'UTC')::date; n int;
BEGIN
  INSERT INTO public.stdlog_counters(day, last_seq)
  VALUES (d, 1)
  ON CONFLICT (day) DO UPDATE SET last_seq = stdlog_counters.last_seq + 1
  RETURNING last_seq INTO n;
  RETURN 'STDLOG_' || to_char(d, 'YYYYMMDD') || '_' || n::text;
END;
$$;
REVOKE ALL ON FUNCTION public.next_stdlog_lot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_stdlog_lot() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_material_receipt_internal_lot()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.material_type = 'controlled'
     AND (NEW.internal_lot IS NULL OR NEW.internal_lot = '')
  THEN
    NEW.internal_lot := public.next_stdlog_lot();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assign_material_receipt_internal_lot ON public.material_receipts;
CREATE TRIGGER trg_assign_material_receipt_internal_lot
  BEFORE INSERT ON public.material_receipts
  FOR EACH ROW EXECUTE FUNCTION public.assign_material_receipt_internal_lot();