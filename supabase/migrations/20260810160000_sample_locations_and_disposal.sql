-- Sample location/disposal lifecycle. One table for every place a
-- sample's physical material has been tracked ("received", "instrument",
-- and future "dilution" locations) instead of a different mechanism per
-- kind, plus a small settings table for the post-completion retention
-- window before disposal is allowed.
--
-- This migration only seeds the schema for location_type IN ('received',
-- 'dilution') -- nothing writes those rows yet. Only 'instrument' rows are
-- populated/consumed this round (run-list generation, completion,
-- the space-crunch warning, and the disposal log).

CREATE TABLE public.sample_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  location_type text NOT NULL CHECK (location_type IN ('received', 'instrument', 'dilution')),
  location text NOT NULL,
  tray_position_id uuid REFERENCES public.tray_positions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'disposed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  disposed_at timestamptz,
  disposed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sample_locations_sample_id_idx ON public.sample_locations (sample_id);
CREATE INDEX sample_locations_status_idx ON public.sample_locations (status);
CREATE INDEX sample_locations_tray_position_id_idx ON public.sample_locations (tray_position_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_locations TO authenticated;
GRANT ALL ON public.sample_locations TO service_role;
ALTER TABLE public.sample_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sample_locations_select" ON public.sample_locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sample_locations_write" ON public.sample_locations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER sample_locations_updated_at BEFORE UPDATE ON public.sample_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.disposal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  retention_days int NOT NULL DEFAULT 30 CHECK (retention_days >= 0)
);
INSERT INTO public.disposal_config (singleton) VALUES (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.disposal_config TO authenticated;
GRANT ALL ON public.disposal_config TO service_role;
ALTER TABLE public.disposal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disposal_config_select" ON public.disposal_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "disposal_config_admin_write" ON public.disposal_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
