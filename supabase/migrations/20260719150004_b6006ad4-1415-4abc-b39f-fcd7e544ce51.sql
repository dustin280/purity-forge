-- Phase 1: Instruments as first-class inventory items
DO $$ BEGIN
  CREATE TYPE public.instrument_op_status AS ENUM ('active', 'maintenance', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS instrument_name text,
  ADD COLUMN IF NOT EXISTS instrument_status public.instrument_op_status,
  ADD COLUMN IF NOT EXISTS default_method_folder text,
  ADD COLUMN IF NOT EXISTS tray_config_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_instrument_name_key
  ON public.inventory_items (instrument_name)
  WHERE instrument_name IS NOT NULL;

-- Phase 2: Method Groups
CREATE TABLE IF NOT EXISTS public.method_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  temperature_c numeric(5,2) NOT NULL,
  priority int NOT NULL,
  default_acquisition_method text,
  default_processing_method text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.method_groups TO authenticated;
GRANT ALL ON public.method_groups TO service_role;
ALTER TABLE public.method_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read method groups" ON public.method_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write method groups" ON public.method_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER method_groups_updated_at BEFORE UPDATE ON public.method_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.method_groups (name, temperature_c, priority, description) VALUES
  ('Polar/Early', 40, 1, 'Polar / early-eluting compounds'),
  ('General',     40, 2, 'General purpose methods'),
  ('Hydrophobes', 40, 3, 'Hydrophobic compounds'),
  ('GLP',         50, 4, 'GLP methods, higher column temperature')
ON CONFLICT (name) DO NOTHING;

-- Link samples to a method group
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS method_group_id uuid REFERENCES public.method_groups(id) ON DELETE SET NULL;

-- Phase 3: Tray configs and positions
CREATE TABLE IF NOT EXISTS public.tray_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tray_configs TO authenticated;
GRANT ALL ON public.tray_configs TO service_role;
ALTER TABLE public.tray_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tray configs" ON public.tray_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write tray configs" ON public.tray_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tray_configs_updated_at BEFORE UPDATE ON public.tray_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN
  CREATE TYPE public.tray_position_status AS ENUM ('available', 'reserved', 'out_of_service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tray_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tray_config_id uuid NOT NULL REFERENCES public.tray_configs(id) ON DELETE CASCADE,
  position_code text NOT NULL,
  drawer text,
  row_label text,
  col_num int,
  is_ref_vial boolean NOT NULL DEFAULT false,
  status public.tray_position_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tray_config_id, position_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tray_positions TO authenticated;
GRANT ALL ON public.tray_positions TO service_role;
ALTER TABLE public.tray_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tray positions" ON public.tray_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write tray positions" ON public.tray_positions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tray_positions_updated_at BEFORE UPDATE ON public.tray_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a default tray config: D1F/D2F/D3F/D4B x A1-F9 (54 each) + Ref 1-5
DO $$
DECLARE
  cfg_id uuid;
  d text;
  r text;
  c int;
  i int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tray_configs WHERE name = 'Default 4-Drawer') THEN
    INSERT INTO public.tray_configs (name, notes, is_default)
      VALUES ('Default 4-Drawer', 'D1F, D2F, D3F, D4B; A1-F9 per drawer; Ref 1-5', true)
      RETURNING id INTO cfg_id;

    FOREACH d IN ARRAY ARRAY['D1F','D2F','D3F','D4B'] LOOP
      FOREACH r IN ARRAY ARRAY['A','B','C','D','E','F'] LOOP
        FOR c IN 1..9 LOOP
          INSERT INTO public.tray_positions (tray_config_id, position_code, drawer, row_label, col_num, is_ref_vial)
            VALUES (cfg_id, d || '-' || r || c, d, r, c, false);
        END LOOP;
      END LOOP;
    END LOOP;

    FOR i IN 1..5 LOOP
      INSERT INTO public.tray_positions (tray_config_id, position_code, drawer, is_ref_vial)
        VALUES (cfg_id, 'Ref-' || i, 'Ref', true);
    END LOOP;
  END IF;
END $$;

-- FK for the inventory link
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_tray_config_fk
  FOREIGN KEY (tray_config_id) REFERENCES public.tray_configs(id) ON DELETE SET NULL;

-- Phase 5: Daily Run## counter per instrument
CREATE TABLE IF NOT EXISTS public.run_list_daily_counters (
  day date NOT NULL,
  instrument_key text NOT NULL,
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, instrument_key)
);
GRANT SELECT, INSERT, UPDATE ON public.run_list_daily_counters TO authenticated;
GRANT ALL ON public.run_list_daily_counters TO service_role;
ALTER TABLE public.run_list_daily_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth counters" ON public.run_list_daily_counters FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.next_run_list_seq(p_instrument_key text, p_day date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.run_list_daily_counters(day, instrument_key, last_seq)
  VALUES (p_day, p_instrument_key, 1)
  ON CONFLICT (day, instrument_key) DO UPDATE SET last_seq = run_list_daily_counters.last_seq + 1
  RETURNING last_seq INTO n;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.next_run_list_seq(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_run_list_seq(text, date) TO authenticated, service_role;