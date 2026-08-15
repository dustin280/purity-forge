-- Hourly trigger for the Cal Std / QC peak-trend watcher, offset 15 minutes
-- from the other hourly watchers (reconcile-reports, pressure-log) to avoid
-- them all firing in the same minute. Reuses the same shared cron_secret.

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
