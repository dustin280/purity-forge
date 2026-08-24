-- Shared cross-module document numbering system: SYN-{CODE}-{seq}-{MMDDYY}.
-- Replaces the pile of ad-hoc per-module ID schemes (log_number/syn_id
-- duplication on standard_preparation_logs, prep_number, receipt_number,
-- batch_number, ...) with one registry and one atomically-incrementing
-- counter per document type, so every controlled record in the lab has a
-- real, unique, auditable number and a single place to look any of them up.
--
-- Sample/batch IDs (SYX-NNNNNN via next_coc_invoice_number) are explicitly
-- OUT of scope -- real production data already keys off them.
--
-- Line-item addressing (e.g. "L2 of this Standard Set") is not a separate
-- table: it's `{document_number}-{row_no}`, using whatever ordinal column
-- the domain table already has (standard_preparation_targets.row_no, etc.),
-- computed at display/print time -- mirrors how CoC already turns
-- SYX-000123 into SYX-000123-01 per vial.

CREATE TABLE IF NOT EXISTS public.document_counters (
  code text PRIMARY KEY,
  next_seq integer NOT NULL DEFAULT 1
);

INSERT INTO public.document_counters (code) VALUES
  ('STDP'), ('QCP'), ('SAMP'), ('RUNL'), ('MREC'), ('JRNL'), ('NCR'), ('BNCH')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_counters_select ON public.document_counters FOR SELECT USING (true);
-- No insert/update/delete policy -- only the SECURITY DEFINER function below
-- (next_document_number) ever changes a counter.

CREATE TABLE IF NOT EXISTS public.document_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text NOT NULL UNIQUE,
  code text NOT NULL REFERENCES public.document_counters(code),
  seq_number integer NOT NULL,
  record_date date NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX idx_document_records_code ON public.document_records(code);
CREATE INDEX idx_document_records_source ON public.document_records(source_table, source_id);

ALTER TABLE public.document_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_records_select ON public.document_records FOR SELECT USING (true);
-- No direct insert/update/delete policy -- only register_document (below)
-- writes here, and it's SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.next_document_number(p_code text, p_date date DEFAULT (now() AT TIME ZONE 'UTC')::date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.document_counters
  SET next_seq = next_seq + 1
  WHERE code = p_code
  RETURNING next_seq - 1 INTO n;

  IF n IS NULL THEN
    RAISE EXCEPTION 'Unknown document code: %', p_code;
  END IF;

  RETURN 'SYN-' || p_code || '-' || lpad(n::text, 6, '0') || '-' || to_char(p_date, 'MMDDYY');
END;
$$;

CREATE OR REPLACE FUNCTION public.register_document(
  p_code text,
  p_source_table text,
  p_source_id uuid,
  p_date date DEFAULT (now() AT TIME ZONE 'UTC')::date,
  p_created_by uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number text;
  v_seq integer;
BEGIN
  v_number := public.next_document_number(p_code, p_date);
  v_seq := split_part(v_number, '-', 3)::integer;

  INSERT INTO public.document_records (document_number, code, seq_number, record_date, source_table, source_id, created_by)
  VALUES (v_number, p_code, v_seq, p_date, p_source_table, p_source_id, p_created_by);

  RETURN v_number;
END;
$$;

-- ---------- Standard Preparations pilot ----------
-- Repurpose log_number to carry the new SYN-STDP-###-MMDDYY format (same
-- column, same meaning -- "this record's number" -- new generation logic,
-- issued by the app via register_document instead of a DB default). Drops
-- the syn_id column it was duplicating: two IDs on one row was the exact
-- problem this system exists to fix, and there's no real production data
-- riding on either number yet, so a clean renumber is safe.

ALTER TABLE public.standard_preparation_logs ALTER COLUMN log_number DROP DEFAULT;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, prepared_at FROM public.standard_preparation_logs ORDER BY prepared_at, created_at LOOP
    UPDATE public.standard_preparation_logs
    SET log_number = public.register_document('STDP', 'standard_preparation_logs', r.id, r.prepared_at::date)
    WHERE id = r.id;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.standard_preparation_logs_syn_id_key;
ALTER TABLE public.standard_preparation_logs DROP COLUMN IF EXISTS syn_id;

DROP FUNCTION IF EXISTS public.next_syn_id(text, date);
DROP TABLE IF EXISTS public.syn_id_counters;
DROP FUNCTION IF EXISTS public.next_standard_preparation_number();
DROP TABLE IF EXISTS public.standard_preparation_counters;
