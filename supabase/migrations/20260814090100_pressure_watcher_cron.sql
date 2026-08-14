-- Hourly trigger for the pressure-log watcher, mirroring
-- trigger_report_reconciliation() / reconcile-reports-hourly exactly,
-- including reuse of the same shared sp_settings.cron_secret.

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
