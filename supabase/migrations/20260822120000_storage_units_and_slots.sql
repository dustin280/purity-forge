-- Storage & equipment tracking: fridges, freezers, incubators, autoclaves.
-- Mirrors the tray_configs/tray_positions pattern (admin-managed parent unit
-- + child positions) and extends the existing generic sample_locations
-- table (assign/release/dispose lifecycle already built for instrument
-- tray positions, see sample-disposal.functions.ts) rather than duplicating it.

DO $$ BEGIN
  CREATE TYPE public.storage_unit_type AS ENUM ('fridge', 'freezer', 'incubator', 'autoclave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.storage_slot_status AS ENUM ('available', 'occupied', 'out_of_service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.storage_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_type public.storage_unit_type NOT NULL,
  name text NOT NULL UNIQUE,
  tray_count int CHECK (tray_count IS NULL OR tray_count > 0),
  manufacturer text,
  model text,
  serial_number text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_units TO authenticated;
GRANT ALL ON public.storage_units TO service_role;
ALTER TABLE public.storage_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read storage units" ON public.storage_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write storage units" ON public.storage_units FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER storage_units_updated_at BEFORE UPDATE ON public.storage_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.storage_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_unit_id uuid NOT NULL REFERENCES public.storage_units(id) ON DELETE CASCADE,
  tray_number int NOT NULL CHECK (tray_number > 0),
  label text NOT NULL,
  status public.storage_slot_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_unit_id, tray_number)
);
CREATE INDEX storage_slots_unit_id_idx ON public.storage_slots (storage_unit_id);
CREATE INDEX storage_slots_status_idx ON public.storage_slots (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_slots TO authenticated;
GRANT ALL ON public.storage_slots TO service_role;
ALTER TABLE public.storage_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read storage slots" ON public.storage_slots FOR SELECT TO authenticated USING (true);
-- Structural changes (adding/removing trays) are admin-only, matching
-- storage_units; day-to-day occupancy flips happen via the tech/reviewer/
-- admin assignment functions, same operational-write split sample_locations
-- already uses relative to the admin-only tray_configs/tray_positions.
CREATE POLICY "admin insert storage slots" ON public.storage_slots FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete storage slots" ON public.storage_slots FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "operational update storage slots" ON public.storage_slots FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER storage_slots_updated_at BEFORE UPDATE ON public.storage_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend sample_locations to cover fridge/freezer/incubator, reusing its
-- existing assign/release/dispose lifecycle instead of a parallel table.
ALTER TABLE public.sample_locations
  ADD COLUMN storage_slot_id uuid REFERENCES public.storage_slots(id) ON DELETE SET NULL;
CREATE INDEX sample_locations_storage_slot_id_idx ON public.sample_locations (storage_slot_id);

ALTER TABLE public.sample_locations DROP CONSTRAINT sample_locations_location_type_check;
ALTER TABLE public.sample_locations ADD CONSTRAINT sample_locations_location_type_check
  CHECK (location_type IN ('received', 'instrument', 'dilution', 'fridge', 'freezer', 'incubator'));
