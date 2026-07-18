-- Extend sample_status enum
ALTER TYPE public.sample_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE public.sample_status ADD VALUE IF NOT EXISTS 'in_analysis';
ALTER TYPE public.sample_status ADD VALUE IF NOT EXISTS 'on_hold';
ALTER TYPE public.sample_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Queue config (single-row keyed table)
CREATE TABLE IF NOT EXISTS public.queue_config (
  id boolean PRIMARY KEY DEFAULT true,
  daily_capacity integer NOT NULL DEFAULT 20 CHECK (daily_capacity > 0),
  tat_days integer NOT NULL DEFAULT 5 CHECK (tat_days > 0),
  business_days_only boolean NOT NULL DEFAULT false,
  approaching_threshold_pct integer NOT NULL DEFAULT 80 CHECK (approaching_threshold_pct BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_config_singleton CHECK (id = true)
);

GRANT SELECT, INSERT, UPDATE ON public.queue_config TO authenticated;
GRANT ALL ON public.queue_config TO service_role;

ALTER TABLE public.queue_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_config_select_auth" ON public.queue_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "queue_config_write_admin" ON public.queue_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_queue_config_updated
  BEFORE UPDATE ON public.queue_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.queue_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Extend samples with scheduling fields
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS assigned_analysis_date date,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_completion_date date;

CREATE INDEX IF NOT EXISTS samples_due_date_idx ON public.samples(due_date);
CREATE INDEX IF NOT EXISTS samples_assigned_date_idx ON public.samples(assigned_analysis_date);

-- Trigger: set due_date on insert from queue_config.tat_days when missing
CREATE OR REPLACE FUNCTION public.set_sample_due_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg_tat int;
BEGIN
  IF NEW.due_date IS NULL THEN
    SELECT tat_days INTO cfg_tat FROM public.queue_config WHERE id = true;
    NEW.due_date := COALESCE(NEW.receipt_date::date, CURRENT_DATE) + COALESCE(cfg_tat, 5);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_samples_set_due_date ON public.samples;
CREATE TRIGGER trg_samples_set_due_date
  BEFORE INSERT ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.set_sample_due_date();

-- Backfill existing rows
UPDATE public.samples
  SET due_date = receipt_date::date + 5
  WHERE due_date IS NULL;