ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS uv_conf_match numeric,
  ADD COLUMN IF NOT EXISTS wavelength_nm numeric;