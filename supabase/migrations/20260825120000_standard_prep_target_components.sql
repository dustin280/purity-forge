-- Multi-compound-per-level standard sets: standard_preparation_targets
-- already supports N levels per prep (row_no 1..N), but each target row
-- only had one name/one concentration -- no way to represent a level like
-- SUMMIT's L1 (Cartalax 0.20 + BPC 0.45 + TB 0.25 + KPV 0.10 all at once).
-- This child table lets one target row reference multiple compounds, each
-- with its own concentration and stock volume at that level -- same
-- structural pattern as compound_blend_components, one level down.

CREATE TABLE IF NOT EXISTS standard_preparation_target_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES standard_preparation_targets(id) ON DELETE CASCADE,
  compound_id uuid REFERENCES compounds(id) ON DELETE SET NULL,
  compound_name text NOT NULL,
  concentration_mg_per_ml numeric,
  stock_volume_ul numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE standard_preparation_target_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY sptc_select ON standard_preparation_target_components
  FOR SELECT USING (true);
CREATE POLICY sptc_insert ON standard_preparation_target_components
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY sptc_update ON standard_preparation_target_components
  FOR UPDATE USING (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY sptc_delete ON standard_preparation_target_components
  FOR DELETE USING (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
