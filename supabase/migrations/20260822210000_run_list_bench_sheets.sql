-- Digital bench sheet ("Record of Analysis") per run list — documents the
-- physical execution of a batch run: who ran it, when it started/finished,
-- observations, deviations, and reviewer sign-off. Deliberately separate
-- from run_lists.status, which tracks generation/export (a different
-- lifecycle) — this table's own status tracks physical execution instead.
-- Per-sample prep data and remarks are pulled from existing tables
-- (sp_preparation_records/sterility_preps via run_list_items, and
-- run_list_items.comment) rather than duplicated here.

CREATE TABLE public.run_list_bench_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_list_id uuid NOT NULL UNIQUE REFERENCES public.run_lists(id) ON DELETE CASCADE,
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz,
  run_started_at timestamptz,
  run_completed_at timestamptz,
  narrative text,
  deviation_flag boolean NOT NULL DEFAULT false,
  deviation_notes text,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'reviewed')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX run_list_bench_sheets_run_list_id_idx ON public.run_list_bench_sheets (run_list_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_list_bench_sheets TO authenticated;
GRANT ALL ON public.run_list_bench_sheets TO service_role;
ALTER TABLE public.run_list_bench_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bench sheets" ON public.run_list_bench_sheets FOR SELECT TO authenticated USING (true);
CREATE POLICY "operational write bench sheets" ON public.run_list_bench_sheets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER run_list_bench_sheets_updated_at BEFORE UPDATE ON public.run_list_bench_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
