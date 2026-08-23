-- Compounds carry their own method + calibration configuration directly,
-- replacing the method_groups indirection. Blends become real rows in the
-- same table (is_blend = true), with per-component-per-level calibration
-- targets in compound_blend_components -- the same staggered design used
-- for the SUMMIT standard set on 2026-08-23, made structural instead of
-- one-off. method_groups is left in place (archived, not dropped) so
-- nothing already pointing at it breaks.

ALTER TABLE compounds
  ADD COLUMN IF NOT EXISTS acquisition_method text,
  ADD COLUMN IF NOT EXISTS processing_method text,
  ADD COLUMN IF NOT EXISTS column_temperature_c numeric,
  ADD COLUMN IF NOT EXISTS is_blend boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS combined_net_content_value numeric,
  ADD COLUMN IF NOT EXISTS combined_net_content_unit text DEFAULT 'mg';

CREATE TABLE IF NOT EXISTS compound_blend_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blend_id uuid NOT NULL REFERENCES compounds(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES compounds(id) ON DELETE RESTRICT,
  nominal_amount_value numeric,
  nominal_amount_unit text DEFAULT 'mg',
  cal_l1_mg_per_ml numeric,
  cal_l2_mg_per_ml numeric,
  cal_l3_mg_per_ml numeric,
  cal_l4_mg_per_ml numeric,
  cal_l5_mg_per_ml numeric,
  cal_l6_mg_per_ml numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blend_id, component_id),
  CHECK (blend_id <> component_id)
);

ALTER TABLE compound_blend_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY compound_blend_components_select ON compound_blend_components
  FOR SELECT USING (true);
CREATE POLICY compound_blend_components_insert ON compound_blend_components
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY compound_blend_components_update ON compound_blend_components
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY compound_blend_components_delete ON compound_blend_components
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
