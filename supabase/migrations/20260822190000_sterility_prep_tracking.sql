-- USP <71> sterility prep + 14-day incubation tracking. One row per
-- sterility test's inoculation event; readout itself still lives in
-- nonchrom_results as today (see saveNonchromResult) — "read out" here just
-- means "a nonchrom_results row now exists for this test_id".

ALTER TABLE public.sp_settings
  ADD COLUMN IF NOT EXISTS sterility_interim_check_day int NOT NULL DEFAULT 4 CHECK (sterility_interim_check_day > 0),
  ADD COLUMN IF NOT EXISTS sterility_readout_day int NOT NULL DEFAULT 14 CHECK (sterility_readout_day > 0);

CREATE TABLE public.sterility_preps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  ftm_receipt_id uuid REFERENCES public.material_receipts(id) ON DELETE SET NULL,
  ftm_lot_number text,
  tsb_receipt_id uuid REFERENCES public.material_receipts(id) ON DELETE SET NULL,
  tsb_lot_number text,
  inoculation_volume_ml numeric(6,2) NOT NULL DEFAULT 1.0,
  media_volume_ml numeric(6,2) NOT NULL DEFAULT 10.0,
  prepared_by uuid REFERENCES auth.users(id),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  interim_check_status text NOT NULL DEFAULT 'pending' CHECK (interim_check_status IN ('pending', 'clear', 'turbid')),
  interim_check_at timestamptz,
  interim_check_by uuid REFERENCES auth.users(id),
  interim_check_notes text,
  interim_notified_at timestamptz,
  readout_notified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sterility_preps_test_id_idx ON public.sterility_preps (test_id);
CREATE INDEX sterility_preps_sample_id_idx ON public.sterility_preps (sample_id);
CREATE INDEX sterility_preps_prepared_at_idx ON public.sterility_preps (prepared_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sterility_preps TO authenticated;
GRANT ALL ON public.sterility_preps TO service_role;
ALTER TABLE public.sterility_preps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sterility preps" ON public.sterility_preps FOR SELECT TO authenticated USING (true);
CREATE POLICY "operational write sterility preps" ON public.sterility_preps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER sterility_preps_updated_at BEFORE UPDATE ON public.sterility_preps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Hourly watcher: notifies when a sterility prep crosses its interim-check
-- or readout threshold. Same shared-secret cron pattern as
-- trigger_report_reconciliation (see 20260811163250_report_reconciliation_cron.sql).
CREATE OR REPLACE FUNCTION public.trigger_incubation_watcher()
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
    url := 'https://syxlab.org/api/cron/incubation-watcher',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule(
  'incubation-watcher-hourly',
  '0 * * * *',
  'SELECT public.trigger_incubation_watcher();'
);
