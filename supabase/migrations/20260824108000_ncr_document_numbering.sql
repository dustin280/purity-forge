-- Non-Conformity rollout of the shared document numbering system (see
-- 20260824090000_document_numbering_system.sql). NCR covers issue_reports
-- (Issues/Deviations) and nc_evaluations (Non-Conformity) as one merged
-- numbering space -- both draw from the same NCR counter, per Dustin's
-- call that these are one record type, not three.

ALTER TABLE public.issue_reports ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE public.nc_evaluations ADD COLUMN IF NOT EXISTS document_number text;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, occurred_at FROM public.issue_reports ORDER BY occurred_at LOOP
    UPDATE public.issue_reports
    SET document_number = public.register_document('NCR', 'issue_reports', r.id, r.occurred_at::date)
    WHERE id = r.id;
  END LOOP;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, created_at FROM public.nc_evaluations ORDER BY created_at LOOP
    UPDATE public.nc_evaluations
    SET document_number = public.register_document('NCR', 'nc_evaluations', r.id, r.created_at::date)
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.issue_reports ALTER COLUMN document_number SET NOT NULL;
ALTER TABLE public.issue_reports ADD CONSTRAINT issue_reports_document_number_key UNIQUE (document_number);

ALTER TABLE public.nc_evaluations ALTER COLUMN document_number SET NOT NULL;
ALTER TABLE public.nc_evaluations ADD CONSTRAINT nc_evaluations_document_number_key UNIQUE (document_number);
