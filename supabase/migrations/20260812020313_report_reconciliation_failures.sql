-- Cost control: the hourly reconciliation cron was re-downloading and
-- re-parsing the same failing report file every single hour forever (a
-- persistently unparseable file never stops costing a Drive download + a
-- parse). This table records one row per (sample, file) the first time
-- applyOneMatch fails on it; the cron then skips any match whose file
-- already has a row here instead of retrying it, capping each file at one
-- parse attempt. A new/corrected file for the same sample still gets its
-- own attempt since the unique key includes file_id.
CREATE TABLE public.report_reconciliation_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  file_name text NOT NULL,
  error text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sample_id, file_id)
);
GRANT SELECT ON public.report_reconciliation_failures TO authenticated;
GRANT ALL ON public.report_reconciliation_failures TO service_role;
ALTER TABLE public.report_reconciliation_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read report reconciliation failures" ON public.report_reconciliation_failures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
