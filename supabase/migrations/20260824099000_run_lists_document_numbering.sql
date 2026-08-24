-- Run Lists rollout of the shared document numbering system (see
-- 20260824090000_document_numbering_system.sql). Adds document_number as
-- the real audit-trail ID (SYN-RUNL-######-MMDDYY) -- separate from `name`,
-- which stays the OpenLab-facing sample-derived label (SYX123_1-4_8-21-26
-- style) and is not touched here.

ALTER TABLE public.run_lists ADD COLUMN IF NOT EXISTS document_number text;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, created_at FROM public.run_lists ORDER BY created_at LOOP
    UPDATE public.run_lists
    SET document_number = public.register_document('RUNL', 'run_lists', r.id, r.created_at::date)
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.run_lists ALTER COLUMN document_number SET NOT NULL;
ALTER TABLE public.run_lists ADD CONSTRAINT run_lists_document_number_key UNIQUE (document_number);
