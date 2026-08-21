ALTER TABLE public.nc_evaluation_findings
  ADD COLUMN IF NOT EXISTS spectral_detail jsonb;
