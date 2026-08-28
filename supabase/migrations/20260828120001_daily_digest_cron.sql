-- Daily digest: one email per subscribed recipient, 7am PST. This repo has
-- no DST-aware cron precedent (every other cron.schedule call here is a
-- plain UTC expression), so 15:00 UTC is used as a fixed approximation of
-- 7am PST -- drifts ~1hr during PDT, same known limitation as the rest of
-- the cron jobs in this codebase, not worth solving here. Reuses
-- sp_settings.cron_secret (already provisioned by the report-reconciliation
-- migration).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_daily_digest()
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
    url := 'https://syxlab.org/api/cron/daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule(
  'daily-digest-7am-pst',
  '0 15 * * *',
  'SELECT public.trigger_daily_digest();'
);
