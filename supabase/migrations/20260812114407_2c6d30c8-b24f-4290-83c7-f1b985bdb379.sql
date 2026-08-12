CREATE TABLE public.report_reconciliation_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sample_id, file_id)
);

GRANT SELECT, INSERT, UPDATE ON public.report_reconciliation_failures TO authenticated;
GRANT ALL ON public.report_reconciliation_failures TO service_role;

ALTER TABLE public.report_reconciliation_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth select report reconciliation failures" ON public.report_reconciliation_failures
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert report reconciliation failures" ON public.report_reconciliation_failures
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth update report reconciliation failures" ON public.report_reconciliation_failures
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);