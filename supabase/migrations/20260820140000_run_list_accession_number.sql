-- C5: "Accession Number" for the OpenLab Sample Custom Parameters panel —
-- a system-generated ID for one specific run of a sample, independent of
-- batch_id/sample_id/prep_number, so a re-run ("do over") gets its own
-- number instead of colliding with the original. Hard-incrementing, never
-- reused, starts at 1578 (Dustin's requirement). Same singleton-counter +
-- SECURITY DEFINER pattern as next_run_list_seq / next_sp_prep_number.
CREATE TABLE public.accession_number_counter (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_number bigint NOT NULL
);
INSERT INTO public.accession_number_counter (id, last_number) VALUES (1, 1577);
GRANT SELECT ON public.accession_number_counter TO authenticated;
GRANT ALL ON public.accession_number_counter TO service_role;
ALTER TABLE public.accession_number_counter ENABLE ROW LEVEL SECURITY;

-- Direct writes happen only via next_accession_numbers() (SECURITY DEFINER,
-- bypasses RLS) — same restriction rationale as run_list_daily_counters.
CREATE POLICY accession_number_counter_admin ON public.accession_number_counter
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.next_accession_numbers(p_count int)
RETURNS bigint[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint; result bigint[];
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN RETURN '{}'; END IF;
  UPDATE public.accession_number_counter
  SET last_number = last_number + p_count
  WHERE id = 1
  RETURNING last_number INTO n;
  SELECT array_agg(g) INTO result FROM generate_series(n - p_count + 1, n) g;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.next_accession_numbers(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_accession_numbers(int) TO authenticated, service_role;

ALTER TABLE public.run_list_items
  ADD COLUMN IF NOT EXISTS accession_number bigint;
CREATE UNIQUE INDEX IF NOT EXISTS run_list_items_accession_number_idx
  ON public.run_list_items(accession_number) WHERE accession_number IS NOT NULL;
