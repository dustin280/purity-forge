-- Link the compound library to method_groups so the Run List Generator's
-- optimizer can eventually derive samples.method_group_id from a sample's
-- compound automatically, instead of every sample landing in the "no
-- group" bucket. Also adds a per-compound injection volume field -- a
-- simple config surface independent of whether the optimizer is actually
-- wired up yet.
ALTER TABLE public.compounds
  ADD COLUMN IF NOT EXISTS method_group_id uuid REFERENCES public.method_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS injection_volume_ul numeric;

-- Bootstrap default: one method group using the real acquisition method
-- being standardized on today. temperature_c/priority are required
-- columns with no natural default yet -- placeholder values, meant to be
-- adjusted once the optimizer's temperature/priority bucketing matters.
INSERT INTO public.method_groups (name, temperature_c, priority, default_acquisition_method)
VALUES ('GenAQ-Waters (default)', 40, 1, 'GenAQ-Waters 8-2-26.amx')
ON CONFLICT (name) DO NOTHING;

UPDATE public.compounds
SET method_group_id = (SELECT id FROM public.method_groups WHERE name = 'GenAQ-Waters (default)')
WHERE method_group_id IS NULL;

-- One-time backfill: existing samples predate this link entirely, so
-- pick up whatever group their compound now has (case-insensitive name
-- match, same approach the app now uses going forward at intake).
UPDATE public.samples
SET method_group_id = compounds.method_group_id
FROM public.compounds
WHERE lower(samples.compound) = lower(compounds.name)
  AND samples.method_group_id IS NULL
  AND compounds.method_group_id IS NOT NULL;
