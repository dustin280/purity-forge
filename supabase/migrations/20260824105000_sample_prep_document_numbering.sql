-- Sample Prep rollout of the shared document numbering system (see
-- 20260824090000_document_numbering_system.sql). Repurposes prep_number to
-- carry SYN-SAMP-######-MMDDYY instead of the old SP-YYYYMMDD-NNN counter;
-- drops the counter it replaces. Covers both entry points into
-- sp_preparation_records (manual createDraftRecord, and the run-list
-- generate-from-run-list persistPlan path) -- same table either way.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, created_at FROM public.sp_preparation_records ORDER BY created_at LOOP
    UPDATE public.sp_preparation_records
    SET prep_number = public.register_document('SAMP', 'sp_preparation_records', r.id, r.created_at::date)
    WHERE id = r.id;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.next_sp_prep_number();
DROP TABLE IF EXISTS public.sp_preparation_counters;
