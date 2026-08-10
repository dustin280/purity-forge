ALTER TABLE public.compounds
  ADD COLUMN IF NOT EXISTS method_group_id uuid REFERENCES public.method_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS injection_volume_ul numeric;

INSERT INTO public.method_groups (name, temperature_c, priority, default_acquisition_method)
VALUES ('GenAQ-Waters (default)', 40, 1, 'GenAQ-Waters 8-2-26.amx')
ON CONFLICT (name) DO NOTHING;

UPDATE public.compounds
SET method_group_id = (SELECT id FROM public.method_groups WHERE name = 'GenAQ-Waters (default)')
WHERE method_group_id IS NULL;

UPDATE public.samples
SET method_group_id = compounds.method_group_id
FROM public.compounds
WHERE lower(samples.compound) = lower(compounds.name)
  AND samples.method_group_id IS NULL
  AND compounds.method_group_id IS NOT NULL;