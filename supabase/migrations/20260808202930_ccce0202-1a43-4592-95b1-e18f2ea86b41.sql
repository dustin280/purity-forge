CREATE TABLE IF NOT EXISTS public.coc_invoice_counters (
  day date PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 99
);

GRANT SELECT ON public.coc_invoice_counters TO authenticated;
GRANT ALL ON public.coc_invoice_counters TO service_role;

ALTER TABLE public.coc_invoice_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY coc_invoice_counters_select ON public.coc_invoice_counters
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_coc_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := (now() AT TIME ZONE 'UTC')::date;
  prefix text := 'COC' || to_char(d, 'MMDDYY') || '-';
  existing_max int;
  n int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(sample_id, '-', 2), '\D', '', 'g'), '')::int), 99)
    INTO existing_max
    FROM public.chain_of_custody_records
   WHERE sample_id LIKE prefix || '%';

  INSERT INTO public.coc_invoice_counters(day, last_seq)
  VALUES (d, GREATEST(existing_max, 99) + 1)
  ON CONFLICT (day) DO UPDATE
    SET last_seq = GREATEST(public.coc_invoice_counters.last_seq, existing_max) + 1
  RETURNING last_seq INTO n;

  RETURN prefix || n::text;
END;
$$;

REVOKE ALL ON FUNCTION public.next_coc_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_coc_invoice_number() TO authenticated;