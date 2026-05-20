
CREATE TABLE IF NOT EXISTS public.syn_id_counters (
  day date PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 0
);

ALTER TABLE public.standard_preparation_logs
  ADD COLUMN IF NOT EXISTS syn_id text,
  ADD COLUMN IF NOT EXISTS batch_group_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS standard_preparation_logs_syn_id_key
  ON public.standard_preparation_logs(syn_id)
  WHERE syn_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS standard_preparation_logs_batch_group_idx
  ON public.standard_preparation_logs(batch_group_id)
  WHERE batch_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_syn_id(p_user_token text, p_day date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  token text;
BEGIN
  token := regexp_replace(upper(coalesce(p_user_token, 'NA')), '[^A-Z0-9]', '', 'g');
  IF token = '' THEN token := 'NA'; END IF;

  INSERT INTO public.syn_id_counters(day, last_seq)
  VALUES (p_day, 1)
  ON CONFLICT (day) DO UPDATE SET last_seq = syn_id_counters.last_seq + 1
  RETURNING last_seq INTO n;

  RETURN 'SYN_' || to_char(p_day, 'MMDDYY') || '_' || token || '_' || n::text;
END;
$$;
