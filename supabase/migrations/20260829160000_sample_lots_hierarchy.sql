-- Three-level sample hierarchy for Sample Receipt:
--   level 1  SYX-000010        the shipment (chain_of_custody_records.sample_id)
--   level 2  SYX-000010-01     one product/lot within that shipment  <- NEW: sample_lots
--   level 3  SYX-000010-01-03  one physical vial, assigned to one test (samples)
--
-- Before this, "these N vials are the same product" existed nowhere in the
-- data model -- it was re-derived downstream by string heuristics (see
-- coa-data.functions.ts, which strips the customer lot's last "-" segment
-- and compares stripped compound names). sample_lots makes it explicit.
--
-- sample_lots is the EDITABLE SOURCE OF TRUTH for lot-level fields, but the
-- values are also mirrored onto every child samples row by the trigger at
-- the bottom of this file. That mirroring is deliberate: every existing
-- downstream consumer (the partner export at /api/public/exports/$batchId,
-- the Internal Lab Report, run lists, the daily digest) reads those fields
-- off `samples` today, and keeping them populated means none of those
-- queries need to change. Fix a value once on the lot, every vial follows.

CREATE TABLE public.sample_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coc_id uuid REFERENCES public.chain_of_custody_records(id) ON DELETE CASCADE,
  -- Level-1 shipment id (e.g. "SYX-000010"), denormalized for display/lookup.
  shipment_id text NOT NULL,
  -- Level-2 ordinal within the shipment (1, 2, 3...).
  lot_no integer NOT NULL,
  -- Rendered level-2 id, e.g. "SYX-000010-01".
  lot_code text NOT NULL UNIQUE,
  -- The customer/partner's BASE lot for this product (e.g. "CBT4808242026").
  -- Note the per-vial partner lot (".. -ST"/"-EN"/"-HM") stays on
  -- samples.lot -- the partner polls the export API by that exact string,
  -- so it must keep resolving to the individual vial.
  customer_lot text,
  compound text,
  compound_id uuid REFERENCES public.compounds(id),
  partner_reported_compound_name text,
  is_multi_component boolean NOT NULL DEFAULT false,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  physical_form text,
  -- Appearance captured once per lot: solids get texture + color, liquids
  -- colour only. physical_description below is the composed human string
  -- ("White cake") kept in sync so the partner export's `appearance` field
  -- is byte-identical to what it returns today.
  appearance_texture text,
  appearance_color text,
  physical_description text,
  container_size text,
  label_content_value numeric,
  label_content_unit text,
  manufacture_date date,
  client_received_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sample_lots_lot_no_positive CHECK (lot_no > 0),
  CONSTRAINT sample_lots_coc_lot_no_unique UNIQUE (coc_id, lot_no)
);

CREATE INDEX sample_lots_coc_id_idx ON public.sample_lots(coc_id);
CREATE INDEX sample_lots_shipment_id_idx ON public.sample_lots(shipment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_lots TO authenticated;
GRANT ALL ON public.sample_lots TO service_role;
ALTER TABLE public.sample_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sample lots" ON public.sample_lots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write sample lots" ON public.sample_lots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER sample_lots_updated_at BEFORE UPDATE ON public.sample_lots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Level-3 additions. All nullable: every pre-existing samples row keeps a
-- NULL lot_id and its original flat 2-segment batch_id untouched (this
-- change is new-intake-only, no backfill).
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.sample_lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vial_no integer,
  ADD COLUMN IF NOT EXISTS assigned_test_type public.test_type,
  ADD COLUMN IF NOT EXISTS appearance_texture text,
  ADD COLUMN IF NOT EXISTS appearance_color text;

CREATE INDEX IF NOT EXISTS samples_lot_id_idx ON public.samples(lot_id);

-- Push lot-level edits down to every vial under that lot. Only fires on an
-- actual change to a mirrored column, and deliberately never touches
-- samples.lot (the partner's per-vial lot string) or anything vial-specific.
CREATE OR REPLACE FUNCTION public.sync_lot_fields_to_samples()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.samples s SET
    compound = NEW.compound,
    compound_id = NEW.compound_id,
    partner_reported_compound_name = NEW.partner_reported_compound_name,
    is_multi_component = NEW.is_multi_component,
    components = NEW.components,
    physical_form = NEW.physical_form,
    appearance_texture = NEW.appearance_texture,
    appearance_color = NEW.appearance_color,
    physical_description = NEW.physical_description,
    container_size = NEW.container_size,
    label_content_value = NEW.label_content_value,
    label_content_unit = NEW.label_content_unit,
    manufacture_date = NEW.manufacture_date,
    client_received_date = NEW.client_received_date
  WHERE s.lot_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sample_lots_sync_to_samples
  AFTER UPDATE ON public.sample_lots
  FOR EACH ROW
  WHEN (
    OLD.compound IS DISTINCT FROM NEW.compound
    OR OLD.compound_id IS DISTINCT FROM NEW.compound_id
    OR OLD.partner_reported_compound_name IS DISTINCT FROM NEW.partner_reported_compound_name
    OR OLD.is_multi_component IS DISTINCT FROM NEW.is_multi_component
    OR OLD.components IS DISTINCT FROM NEW.components
    OR OLD.physical_form IS DISTINCT FROM NEW.physical_form
    OR OLD.appearance_texture IS DISTINCT FROM NEW.appearance_texture
    OR OLD.appearance_color IS DISTINCT FROM NEW.appearance_color
    OR OLD.physical_description IS DISTINCT FROM NEW.physical_description
    OR OLD.container_size IS DISTINCT FROM NEW.container_size
    OR OLD.label_content_value IS DISTINCT FROM NEW.label_content_value
    OR OLD.label_content_unit IS DISTINCT FROM NEW.label_content_unit
    OR OLD.manufacture_date IS DISTINCT FROM NEW.manufacture_date
    OR OLD.client_received_date IS DISTINCT FROM NEW.client_received_date
  )
  EXECUTE FUNCTION public.sync_lot_fields_to_samples();
