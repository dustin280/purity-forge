
CREATE TABLE public.parameter_scouting_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_name text NOT NULL,
  flow_rate_ml_per_min numeric,
  temperature_c numeric,
  mobile_phase_a text NOT NULL DEFAULT 'H2O + 0.1% TFA',
  mobile_phase_b text NOT NULL DEFAULT 'ACN + 0.1% TFA',
  sample_diluent text,
  comments text,
  gradient jsonb NOT NULL DEFAULT '[]'::jsonb,
  run_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parameter_scouting_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY psl_select ON public.parameter_scouting_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY psl_insert ON public.parameter_scouting_logs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY psl_update ON public.parameter_scouting_logs
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());

CREATE POLICY psl_delete ON public.parameter_scouting_logs
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());

CREATE TRIGGER trg_psl_updated_at
  BEFORE UPDATE ON public.parameter_scouting_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_psl_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.parameter_scouting_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE INDEX idx_psl_run_at ON public.parameter_scouting_logs (run_at DESC);
