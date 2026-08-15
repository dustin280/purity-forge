ALTER TABLE public.sp_settings
  ADD COLUMN IF NOT EXISTS drive_cal_std_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_qc_samples_folder_id text;

CREATE TABLE public.cal_qc_peak_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_type text NOT NULL CHECK (sample_type IN ('cal_std', 'qc_check')),
  compound_id uuid REFERENCES public.compounds(id),
  raw_compound_name text NOT NULL,
  match_confidence text NOT NULL CHECK (match_confidence IN ('exact', 'fuzzy', 'unmatched')),
  sample_name text,
  calibration_level int,
  concentration_level numeric,
  concentration_unit text,
  rt numeric NOT NULL,
  area numeric,
  amount numeric,
  reading_at timestamptz NOT NULL,
  sequence_name text NOT NULL,
  injection_id text NOT NULL,
  source_result_file_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (injection_id, raw_compound_name)
);

CREATE INDEX cal_qc_peak_log_compound_idx ON public.cal_qc_peak_log (compound_id, reading_at);

GRANT SELECT, INSERT, DELETE ON public.cal_qc_peak_log TO authenticated;
GRANT ALL ON public.cal_qc_peak_log TO service_role;

ALTER TABLE public.cal_qc_peak_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cqpl_select" ON public.cal_qc_peak_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "cqpl_insert" ON public.cal_qc_peak_log FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech') OR has_role(auth.uid(), 'reviewer') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "cqpl_update" ON public.cal_qc_peak_log FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'tech') OR has_role(auth.uid(), 'reviewer'));

CREATE POLICY "cqpl_delete" ON public.cal_qc_peak_log FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.trigger_cal_qc_watcher()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT cron_secret INTO v_secret FROM public.sp_settings WHERE id = true;
  PERFORM net.http_post(
    url := 'https://syxlab.org/api/cron/cal-qc-watcher',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule(
  'cal-qc-watcher-hourly',
  '15 * * * *',
  'SELECT public.trigger_cal_qc_watcher();'
);

REVOKE EXECUTE ON FUNCTION public.trigger_cal_qc_watcher() FROM PUBLIC, anon, authenticated;