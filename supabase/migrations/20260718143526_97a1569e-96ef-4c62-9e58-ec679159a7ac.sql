CREATE OR REPLACE FUNCTION public.next_syn_id(p_user_token text, p_day date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  RETURN 'SYX_' || to_char(p_day, 'MMDDYY') || '_' || token || '_' || n::text;
END;
$function$;