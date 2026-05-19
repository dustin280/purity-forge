CREATE TABLE public.daily_backpressure_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_at timestamptz NOT NULL DEFAULT now(),
  user_name text NOT NULL,
  user_id uuid,
  instrument text NOT NULL DEFAULT 'Infinity III HPLC-DAD',
  backpressure numeric NOT NULL,
  backpressure_unit text NOT NULL DEFAULT 'bar',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_dbl_reading_at ON public.daily_backpressure_logs (reading_at DESC);

ALTER TABLE public.daily_backpressure_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dbl_select" ON public.daily_backpressure_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "dbl_insert" ON public.daily_backpressure_logs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech') OR has_role(auth.uid(), 'reviewer') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "dbl_update" ON public.daily_backpressure_logs
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR created_by = auth.uid());

CREATE POLICY "dbl_delete" ON public.daily_backpressure_logs
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER dbl_set_updated_at BEFORE UPDATE ON public.daily_backpressure_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER dbl_audit AFTER INSERT OR UPDATE OR DELETE ON public.daily_backpressure_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();