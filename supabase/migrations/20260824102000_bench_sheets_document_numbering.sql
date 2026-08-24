-- Bench Sheets rollout of the shared document numbering system (see
-- 20260824090000_document_numbering_system.sql). No rows exist yet, so
-- document_number goes straight to NOT NULL with no backfill step.

ALTER TABLE public.run_list_bench_sheets ADD COLUMN IF NOT EXISTS document_number text NOT NULL;
ALTER TABLE public.run_list_bench_sheets ADD CONSTRAINT run_list_bench_sheets_document_number_key UNIQUE (document_number);
