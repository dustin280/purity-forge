-- Partner COA export round 2: identity/library match score and detection
-- wavelength, per result. Both nullable and degrade to null in the export
-- until a report/ACAML source actually populates them.
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS uv_conf_match numeric,
  ADD COLUMN IF NOT EXISTS wavelength_nm numeric;
