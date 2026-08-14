-- 1) 20260814090000_pressure_watcher_schema.sql
ALTER TABLE public.sp_settings ADD COLUMN IF NOT EXISTS drive_hplc_results_folder_id text;

ALTER TABLE public.hplc_columns
  ADD COLUMN IF NOT EXISTS installed_on_instrument_id uuid REFERENCES public.instruments(id),
  ADD COLUMN IF NOT EXISTS installed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rated_max_pressure_bar numeric,
  ADD COLUMN IF NOT EXISTS total_injections integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS hplc_columns_one_per_instrument
  ON public.hplc_columns (installed_on_instrument_id)
  WHERE installed_on_instrument_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.increment_hplc_column_injections(p_column_id uuid, p_count int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.hplc_columns SET total_injections = total_injections + p_count WHERE id = p_column_id;
$$;

REVOKE ALL ON FUNCTION public.increment_hplc_column_injections(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_hplc_column_injections(uuid, int) TO authenticated, service_role;

ALTER TABLE public.daily_backpressure_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS acquisition_method text,
  ADD COLUMN IF NOT EXISTS pressure_run_min numeric,
  ADD COLUMN IF NOT EXISTS pressure_run_max numeric,
  ADD COLUMN IF NOT EXISTS drive_result_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_dx_file_id text;

ALTER TABLE public.daily_backpressure_logs
  ADD CONSTRAINT dbl_source_check CHECK (source IN ('manual', 'auto'));

CREATE UNIQUE INDEX IF NOT EXISTS dbl_drive_result_folder_id_key
  ON public.daily_backpressure_logs (drive_result_folder_id)
  WHERE drive_result_folder_id IS NOT NULL;

-- 2) 20260814090100_pressure_watcher_cron.sql
CREATE OR REPLACE FUNCTION public.trigger_pressure_log_watcher()
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
    url := 'https://syxlab.org/api/cron/pressure-log',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule(
  'pressure-log-watcher-hourly',
  '0 * * * *',
  'SELECT public.trigger_pressure_log_watcher();'
);

-- 3) 20260814090200_pressure_watcher_cron_revoke.sql
REVOKE EXECUTE ON FUNCTION public.trigger_pressure_log_watcher() FROM PUBLIC, anon, authenticated;