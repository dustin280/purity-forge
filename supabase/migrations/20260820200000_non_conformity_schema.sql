-- Non-Conformity Identifier: self-contained schema for the impurity/
-- degradant/oligomer screening engine. Read-only against samples/results/
-- peaks — this subsystem writes nothing back to compliance-critical tables
-- (results, tests, samples), by design: it's an optional internal review
-- aid, not part of the review/approve/COA trail.

CREATE TABLE public.nc_compounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compound_id uuid REFERENCES public.compounds(id),
  name text NOT NULL,
  class text,
  sequence_composition text,
  amino_acid_composition text,
  molecular_formula text,
  monoisotopic_mass numeric,
  mz_1plus numeric,
  mz_2plus numeric,
  cas_number text,
  dad_primary text,
  dad_secondary text,
  dad_guidance text,
  key_chromophores text,
  form_notes text,
  review_flag text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_nc_compounds_name ON public.nc_compounds(name);
CREATE INDEX idx_nc_compounds_compound_id ON public.nc_compounds(compound_id) WHERE compound_id IS NOT NULL;

CREATE TABLE public.nc_impurity_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_compound_id uuid NOT NULL REFERENCES public.nc_compounds(id) ON DELETE CASCADE,
  impurity_code text NOT NULL,
  name text NOT NULL,
  category text,
  evidence_level text,
  formation_pathway text,
  structure_change text,
  molecular_formula text,
  formula_delta text,
  monoisotopic_mass numeric,
  mass_delta numeric,
  mz_1plus numeric,
  mz_2plus numeric,
  dad_primary text,
  dad_secondary text,
  dad_discriminator text,
  rp_hplc_behavior text,
  lc_ms_discriminator text,
  likely_trigger text,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nc_impurity_candidates_compound ON public.nc_impurity_candidates(nc_compound_id);

CREATE TABLE public.nc_oligomer_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_compound_id uuid NOT NULL REFERENCES public.nc_compounds(id) ON DELETE CASCADE,
  oligomer_code text NOT NULL,
  name text NOT NULL,
  class text,
  stoichiometry text,
  evidence_level text,
  mechanism_pathway text,
  trigger_motif text,
  molecular_formula text,
  monoisotopic_mass numeric,
  mass_delta_vs_n_monomer numeric,
  mz_1plus numeric,
  mz_2plus numeric,
  other_diagnostic_ions text,
  expected_normalized_dad text,
  dad_discriminator text,
  rp_hplc_behavior text,
  best_orthogonal_discriminator text,
  lc_ms_discriminator text,
  false_positive_warning text,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nc_oligomer_candidates_compound ON public.nc_oligomer_candidates(nc_compound_id);

CREATE TABLE public.nc_detection_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('impurity', 'oligomer')),
  applies_to text,
  trigger_feature text,
  candidate_product text,
  formula_delta text,
  mass_delta numeric,
  rp_hplc_behavior text,
  dad_behavior text,
  discriminator text,
  guardrail text,
  evidence_level text,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_nc_detection_rules_rule_id ON public.nc_detection_rules(rule_id);

CREATE TABLE public.nc_evidence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id text NOT NULL,
  observation text NOT NULL,
  suggested_score_effect text,
  interpretation_guardrail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_nc_evidence_rules_rule_id ON public.nc_evidence_rules(rule_id);

CREATE TABLE public.nc_spectral_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_compound_id uuid NOT NULL REFERENCES public.nc_compounds(id) ON DELETE CASCADE,
  wavelengths_nm integer[] NOT NULL,
  recommended_range text,
  panel_rationale text,
  recommended_features text,
  parent_dad_guidance text,
  important_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_nc_spectral_panels_compound ON public.nc_spectral_panels(nc_compound_id);

-- One row per analyst-run evaluation. result_id/sample_id are references
-- only — this table is never joined into the compliance review/approve
-- gate and nothing here is written back onto results/samples.
CREATE TABLE public.nc_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid,
  sample_id uuid,
  nc_compound_id uuid REFERENCES public.nc_compounds(id),
  run_by uuid,
  run_by_name text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  stress_context text,
  summary text,
  overall_tier text CHECK (overall_tier IN ('clear', 'candidate', 'probable_class', 'probable_identity')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nc_evaluations_sample ON public.nc_evaluations(sample_id);
CREATE INDEX idx_nc_evaluations_result ON public.nc_evaluations(result_id);

CREATE TABLE public.nc_evaluation_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.nc_evaluations(id) ON DELETE CASCADE,
  peak_id text,
  rt numeric,
  area_pct numeric,
  peak_purity numeric,
  peak_purity_passed boolean,
  uv_match numeric,
  observed_mz numeric,
  observed_neutral_mass numeric,
  adduct text,
  candidate_kind text CHECK (candidate_kind IN ('impurity', 'oligomer')),
  matched_candidate_id uuid,
  component_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_evidence_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  tier text NOT NULL CHECK (tier IN ('unflagged', 'candidate', 'probable_class', 'probable_identity')),
  rationale text,
  analyst_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nc_evaluation_findings_evaluation ON public.nc_evaluation_findings(evaluation_id);

-- RLS: read for all authenticated, write with actor checked — same shape
-- as standard_preparation_usage_log (Track A3).
ALTER TABLE public.nc_compounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_impurity_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_oligomer_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_detection_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_evidence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_spectral_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nc_evaluation_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY nc_compounds_read ON public.nc_compounds FOR SELECT TO authenticated USING (true);
CREATE POLICY nc_compounds_write ON public.nc_compounds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY nc_compounds_update ON public.nc_compounds FOR UPDATE TO authenticated USING (true);

CREATE POLICY nc_impurity_candidates_read ON public.nc_impurity_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY nc_impurity_candidates_write ON public.nc_impurity_candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY nc_impurity_candidates_update ON public.nc_impurity_candidates FOR UPDATE TO authenticated USING (true);

CREATE POLICY nc_oligomer_candidates_read ON public.nc_oligomer_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY nc_oligomer_candidates_write ON public.nc_oligomer_candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY nc_oligomer_candidates_update ON public.nc_oligomer_candidates FOR UPDATE TO authenticated USING (true);

CREATE POLICY nc_detection_rules_read ON public.nc_detection_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY nc_evidence_rules_read ON public.nc_evidence_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY nc_spectral_panels_read ON public.nc_spectral_panels FOR SELECT TO authenticated USING (true);

CREATE POLICY nc_evaluations_read ON public.nc_evaluations FOR SELECT TO authenticated USING (true);
CREATE POLICY nc_evaluations_insert ON public.nc_evaluations FOR INSERT TO authenticated WITH CHECK (run_by = auth.uid());

CREATE POLICY nc_evaluation_findings_read ON public.nc_evaluation_findings FOR SELECT TO authenticated USING (true);
CREATE POLICY nc_evaluation_findings_insert ON public.nc_evaluation_findings FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.nc_evaluations e WHERE e.id = evaluation_id AND e.run_by = auth.uid())
);
