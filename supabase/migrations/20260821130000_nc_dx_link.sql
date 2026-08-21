ALTER TABLE public.nc_evaluations
  ADD COLUMN IF NOT EXISTS dx_file_id text,
  ADD COLUMN IF NOT EXISTS dx_folder_id text,
  ADD COLUMN IF NOT EXISTS dx_match_confidence text CHECK (dx_match_confidence IN ('auto', 'manual', 'none'));
