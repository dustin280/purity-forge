
-- =========================================================================
-- Sample Preparation Phase 1A: master data tables
-- =========================================================================

CREATE TABLE public.sp_analytes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  abbreviation text,
  category text,
  salt_form text,
  cas_number text,
  molecular_formula text,
  molecular_weight numeric,
  sequence text,
  description text,
  default_mass_unit text,
  default_concentration_unit text,
  default_solvent_recommendations text,
  solubility_notes text,
  stability_notes text,
  storage_notes text,
  handling_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sp_analytes_canonical_name_key ON public.sp_analytes (lower(canonical_name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_analytes TO authenticated;
GRANT ALL ON public.sp_analytes TO service_role;
ALTER TABLE public.sp_analytes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_analytes select" ON public.sp_analytes FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_analytes insert" ON public.sp_analytes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sp_analytes update" ON public.sp_analytes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sp_analytes delete admin" ON public.sp_analytes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER sp_analytes_set_updated BEFORE UPDATE ON public.sp_analytes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sp_analytes_audit AFTER INSERT OR UPDATE OR DELETE ON public.sp_analytes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE public.sp_analyte_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyte_id uuid NOT NULL REFERENCES public.sp_analytes(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sp_analyte_aliases_key ON public.sp_analyte_aliases (analyte_id, lower(alias));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_analyte_aliases TO authenticated;
GRANT ALL ON public.sp_analyte_aliases TO service_role;
ALTER TABLE public.sp_analyte_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_aliases select" ON public.sp_analyte_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_aliases write" ON public.sp_analyte_aliases FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sp_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyte_id uuid NOT NULL REFERENCES public.sp_analytes(id) ON DELETE RESTRICT,
  code text,
  name text NOT NULL,
  method_type text,
  intended_use text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_methods TO authenticated;
GRANT ALL ON public.sp_methods TO service_role;
ALTER TABLE public.sp_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_methods select" ON public.sp_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_methods write" ON public.sp_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER sp_methods_set_updated BEFORE UPDATE ON public.sp_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TYPE public.sp_revision_status AS ENUM ('draft','under_review','approved','superseded','retired');

CREATE TABLE public.sp_method_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id uuid NOT NULL REFERENCES public.sp_methods(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  revision int NOT NULL DEFAULT 0,
  status public.sp_revision_status NOT NULL DEFAULT 'draft',
  effective_date date,
  superseded_date date,
  created_by uuid REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approval_date timestamptz,
  change_reason text,
  instrument_type text,
  detector_type text,
  wavelengths jsonb,
  reference_wavelength numeric,
  bandwidth numeric,
  flow_rate numeric,
  column_name text,
  column_manufacturer text,
  column_part_number text,
  stationary_phase text,
  particle_size_um numeric,
  column_dimensions text,
  column_temp_c numeric,
  autosampler_temp_c numeric,
  injection_volume_ul numeric,
  needle_wash text,
  seal_wash text,
  total_run_time_min numeric,
  post_run_time_min numeric,
  estimated_rt_min numeric,
  rt_window_min numeric,
  expected_peak_order text,
  suitability_requirements text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (method_id, version, revision)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_method_revisions TO authenticated;
GRANT ALL ON public.sp_method_revisions TO service_role;
ALTER TABLE public.sp_method_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_rev select" ON public.sp_method_revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_rev insert" ON public.sp_method_revisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sp_rev update draft or admin" ON public.sp_method_revisions FOR UPDATE TO authenticated
  USING (status = 'draft' OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (true);
CREATE POLICY "sp_rev delete admin" ON public.sp_method_revisions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER sp_rev_set_updated BEFORE UPDATE ON public.sp_method_revisions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sp_rev_audit AFTER INSERT OR UPDATE OR DELETE ON public.sp_method_revisions FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE OR REPLACE FUNCTION public.sp_child_writable(_rev uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status = 'draft' OR public.has_role(auth.uid(),'admin')
    FROM public.sp_method_revisions WHERE id = _rev
$$;
REVOKE ALL ON FUNCTION public.sp_child_writable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_child_writable(uuid) TO authenticated;

CREATE TABLE public.sp_method_mobile_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.sp_method_revisions(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('A','B','C','D')),
  composition_text text,
  initial_percent numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_method_mobile_phases TO authenticated;
GRANT ALL ON public.sp_method_mobile_phases TO service_role;
ALTER TABLE public.sp_method_mobile_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_mp select" ON public.sp_method_mobile_phases FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_mp write" ON public.sp_method_mobile_phases FOR ALL TO authenticated
  USING (public.sp_child_writable(revision_id)) WITH CHECK (public.sp_child_writable(revision_id));

CREATE TABLE public.sp_method_gradient_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.sp_method_revisions(id) ON DELETE CASCADE,
  ordinal int NOT NULL,
  time_min numeric,
  pct_a numeric,
  pct_b numeric,
  pct_c numeric,
  pct_d numeric,
  flow_rate numeric,
  curve_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sp_grad_rev_ord ON public.sp_method_gradient_steps (revision_id, ordinal);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_method_gradient_steps TO authenticated;
GRANT ALL ON public.sp_method_gradient_steps TO service_role;
ALTER TABLE public.sp_method_gradient_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_grad select" ON public.sp_method_gradient_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_grad write" ON public.sp_method_gradient_steps FOR ALL TO authenticated
  USING (public.sp_child_writable(revision_id)) WITH CHECK (public.sp_child_writable(revision_id));

CREATE TABLE public.sp_method_calibration_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.sp_method_revisions(id) ON DELETE CASCADE,
  level_number int NOT NULL,
  standard_name text,
  target_concentration numeric,
  concentration_unit text,
  preparation_source text,
  dilution_factor numeric,
  replicate_count int,
  include_in_calibration boolean NOT NULL DEFAULT true,
  weighting_model text,
  regression_model text,
  acceptance_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, level_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_method_calibration_levels TO authenticated;
GRANT ALL ON public.sp_method_calibration_levels TO service_role;
ALTER TABLE public.sp_method_calibration_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_cal select" ON public.sp_method_calibration_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_cal write" ON public.sp_method_calibration_levels FOR ALL TO authenticated
  USING (public.sp_child_writable(revision_id)) WITH CHECK (public.sp_child_writable(revision_id));
CREATE TRIGGER sp_cal_set_updated BEFORE UPDATE ON public.sp_method_calibration_levels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sp_cal_audit AFTER INSERT OR UPDATE OR DELETE ON public.sp_method_calibration_levels FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE public.sp_method_prep_rules (
  revision_id uuid PRIMARY KEY REFERENCES public.sp_method_revisions(id) ON DELETE CASCADE,
  default_target_level int NOT NULL DEFAULT 3,
  default_sample_solvent_id uuid,
  allowed_sample_solvent_ids uuid[],
  default_stock_concentration numeric,
  default_stock_concentration_unit text,
  preferred_initial_reconstitution_volume_ul numeric,
  min_initial_reconstitution_volume_ul numeric,
  max_initial_reconstitution_volume_ul numeric,
  max_dilution_steps int,
  preferred_final_volume_ul numeric,
  allowed_vial_size_ids uuid[],
  min_pipette_volume_ul numeric,
  preferred_min_pipette_volume_ul numeric,
  max_pipette_volume_ul numeric,
  max_concentration_deviation_pct numeric,
  allow_direct boolean NOT NULL DEFAULT true,
  allow_serial boolean NOT NULL DEFAULT true,
  allow_gravimetric boolean NOT NULL DEFAULT true,
  allow_volumetric boolean NOT NULL DEFAULT true,
  mixing_instructions text,
  sonication_instructions text,
  centrifugation_instructions text,
  filtration_instructions text,
  filter_type text,
  filter_pore_um numeric,
  stability_notes text,
  storage_temp_c numeric,
  light_protection boolean,
  max_hold_time text,
  special_handling text,
  safety_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_method_prep_rules TO authenticated;
GRANT ALL ON public.sp_method_prep_rules TO service_role;
ALTER TABLE public.sp_method_prep_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_pr select" ON public.sp_method_prep_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_pr write" ON public.sp_method_prep_rules FOR ALL TO authenticated
  USING (public.sp_child_writable(revision_id)) WITH CHECK (public.sp_child_writable(revision_id));
CREATE TRIGGER sp_pr_set_updated BEFORE UPDATE ON public.sp_method_prep_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sp_vessels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nominal_capacity_ul numeric NOT NULL,
  min_working_volume_ul numeric,
  max_working_volume_ul numeric,
  material text,
  graduated boolean NOT NULL DEFAULT false,
  volumetric boolean NOT NULL DEFAULT false,
  reusable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_vessels TO authenticated;
GRANT ALL ON public.sp_vessels TO service_role;
ALTER TABLE public.sp_vessels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_vessels select" ON public.sp_vessels FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_vessels insert" ON public.sp_vessels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sp_vessels update" ON public.sp_vessels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sp_vessels delete admin" ON public.sp_vessels FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER sp_vessels_set_updated BEFORE UPDATE ON public.sp_vessels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sp_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id text UNIQUE,
  equipment_type text NOT NULL,
  manufacturer text,
  model text,
  serial_number text,
  min_capacity numeric,
  max_capacity numeric,
  capacity_unit text,
  preferred_min numeric,
  preferred_max numeric,
  resolution numeric,
  accuracy text,
  uncertainty text,
  calibration_status text,
  calibration_date date,
  calibration_due_date date,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_equipment TO authenticated;
GRANT ALL ON public.sp_equipment TO service_role;
ALTER TABLE public.sp_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_eq select" ON public.sp_equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_eq insert" ON public.sp_equipment FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sp_eq update" ON public.sp_equipment FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sp_eq delete admin" ON public.sp_equipment FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER sp_eq_set_updated BEFORE UPDATE ON public.sp_equipment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sp_eq_audit AFTER INSERT OR UPDATE OR DELETE ON public.sp_equipment FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE public.sp_solvent_formulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  internal_code text UNIQUE,
  version text,
  storage_conditions text,
  stability_period_days int,
  approved_uses text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_solvent_formulations TO authenticated;
GRANT ALL ON public.sp_solvent_formulations TO service_role;
ALTER TABLE public.sp_solvent_formulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_sol select" ON public.sp_solvent_formulations FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_sol insert" ON public.sp_solvent_formulations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sp_sol update" ON public.sp_solvent_formulations FOR UPDATE TO authenticated
  USING (status = 'draft' OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (true);
CREATE POLICY "sp_sol delete admin" ON public.sp_solvent_formulations FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER sp_sol_set_updated BEFORE UPDATE ON public.sp_solvent_formulations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sp_sol_audit AFTER INSERT OR UPDATE OR DELETE ON public.sp_solvent_formulations FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE public.sp_solvent_formulation_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulation_id uuid NOT NULL REFERENCES public.sp_solvent_formulations(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  percentage numeric,
  percentage_basis text CHECK (percentage_basis IN ('v/v','w/v','w/w','molar')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_solvent_formulation_components TO authenticated;
GRANT ALL ON public.sp_solvent_formulation_components TO service_role;
ALTER TABLE public.sp_solvent_formulation_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_solc select" ON public.sp_solvent_formulation_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_solc write" ON public.sp_solvent_formulation_components FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sp_reagent_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulation_id uuid NOT NULL REFERENCES public.sp_solvent_formulations(id) ON DELETE RESTRICT,
  lot_number text NOT NULL,
  preparation_date date,
  expiration_date date,
  prepared_by uuid REFERENCES auth.users(id),
  final_volume numeric,
  final_volume_unit text,
  ph numeric,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formulation_id, lot_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_reagent_lots TO authenticated;
GRANT ALL ON public.sp_reagent_lots TO service_role;
ALTER TABLE public.sp_reagent_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_lot select" ON public.sp_reagent_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_lot write" ON public.sp_reagent_lots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER sp_lot_set_updated BEFORE UPDATE ON public.sp_reagent_lots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sp_reagent_lot_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reagent_lot_id uuid NOT NULL REFERENCES public.sp_reagent_lots(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  source_lot_number text,
  actual_quantity numeric,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_reagent_lot_components TO authenticated;
GRANT ALL ON public.sp_reagent_lot_components TO service_role;
ALTER TABLE public.sp_reagent_lot_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_lotc select" ON public.sp_reagent_lot_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_lotc write" ON public.sp_reagent_lot_components FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sp_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  absolute_min_pipette_ul numeric NOT NULL DEFAULT 10,
  preferred_min_pipette_ul numeric NOT NULL DEFAULT 20,
  default_calibration_levels int NOT NULL DEFAULT 6,
  default_target_level int NOT NULL DEFAULT 3,
  max_dilution_steps int NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.sp_settings TO authenticated;
GRANT ALL ON public.sp_settings TO service_role;
ALTER TABLE public.sp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_settings select" ON public.sp_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_settings admin write" ON public.sp_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER sp_settings_set_updated BEFORE UPDATE ON public.sp_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.sp_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

INSERT INTO public.sp_vessels (name, nominal_capacity_ul, graduated) VALUES
  ('1 mL vial', 1000, true),
  ('2 mL vial', 2000, true),
  ('5 mL tube', 5000, true),
  ('10 mL tube', 10000, true);

INSERT INTO public.sp_analytes (canonical_name, abbreviation, category) VALUES
  ('TB500 (Thymosin β4 fragment)', 'TB500', 'peptide'),
  ('Ipamorelin', NULL, 'peptide'),
  ('BPC-157 Acetate', NULL, 'peptide'),
  ('Semax', NULL, 'peptide'),
  ('SS-31 (Elamipretide)', 'SS-31', 'peptide'),
  ('Melanotan II', 'MT-II', 'peptide'),
  ('NAD+', 'NAD', 'small molecule'),
  ('Glutathione', 'GSH', 'peptide'),
  ('Tesamorelin', NULL, 'peptide'),
  ('Retatrutide', NULL, 'peptide'),
  ('GHK-Cu', NULL, 'peptide'),
  ('Tirzepatide', NULL, 'peptide'),
  ('Semaglutide', NULL, 'peptide'),
  ('Selank', NULL, 'peptide'),
  ('Cagrilintide', NULL, 'peptide'),
  ('Sermorelin', NULL, 'peptide'),
  ('Tadalafil', NULL, 'small molecule'),
  ('Epitalon', NULL, 'peptide'),
  ('Pinealon', NULL, 'peptide'),
  ('CJC-1295', NULL, 'peptide'),
  ('KPV', NULL, 'peptide'),
  ('PT-141 (Bremelanotide)', 'PT-141', 'peptide'),
  ('BPC-157 free form', NULL, 'peptide'),
  ('MOTS-C', NULL, 'peptide'),
  ('Thymosin Beta 4', 'TB4', 'peptide'),
  ('Melanotan I', 'MT-I', 'peptide'),
  ('5-Amino-1MQ', NULL, 'small molecule'),
  ('DSIP', NULL, 'peptide')
ON CONFLICT DO NOTHING;
