-- Give the cron HTTP triggers a realistic timeout.
--
-- net.http_post defaults to 5000ms. Every one of these endpoints does real
-- work before it answers -- the daily digest alone takes ~3.4s just to build
-- its sections, before it makes a single Resend call, and it makes one per
-- recipient sequentially. net._http_response was full of
-- "Timeout of 5000 ms reached" against syxlab.org every hour.
--
-- pg_net abandoning the response is not harmless: nothing downstream can tell
-- a slow success from a failure, the response body (which carries the digest's
-- own sent/failed counts) is lost, and the request may be cut off mid-send.
-- 60s is well clear of the slowest of these while still bounded.
CREATE OR REPLACE FUNCTION public.trigger_report_reconciliation()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT cron_secret INTO v_secret FROM public.sp_settings WHERE id = true;
  PERFORM net.http_post(
    url := 'https://syxlab.org/api/cron/reconcile-reports',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_pressure_log_watcher()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT cron_secret INTO v_secret FROM public.sp_settings WHERE id = true;
  PERFORM net.http_post(
    url := 'https://syxlab.org/api/cron/pressure-log',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_cal_qc_watcher()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT cron_secret INTO v_secret FROM public.sp_settings WHERE id = true;
  PERFORM net.http_post(
    url := 'https://syxlab.org/api/cron/cal-qc-watcher',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_incubation_watcher()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT cron_secret INTO v_secret FROM public.sp_settings WHERE id = true;
  PERFORM net.http_post(
    url := 'https://syxlab.org/api/cron/incubation-watcher',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_daily_digest()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT cron_secret INTO v_secret FROM public.sp_settings WHERE id = true;
  PERFORM net.http_post(
    url := 'https://syxlab.org/api/cron/daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

-- The 7am PST schedule was written as 15:00 UTC, which is 8am during PDT --
-- and PDT covers most of the year. 14:00 UTC is 7am PDT.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'daily-digest-7am-pst'),
  schedule := '0 14 * * *'
);
