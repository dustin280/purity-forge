-- Equipment temperature setting (fridges/freezers/incubators/autoclaves all
-- carry a configured temp other features can reference/default from), and
-- moves sterility's mid-incubation check from one per-batch check to two
-- per-sample checkpoints (Day 3 / Day 7) — growth can show on one sample's
-- tube and not another's, so this can't be batch-wide.

ALTER TABLE public.storage_units
  ADD COLUMN IF NOT EXISTS target_temperature_c numeric(5,2);

ALTER TABLE public.analysis_batches
  DROP COLUMN IF EXISTS interim_check_status,
  DROP COLUMN IF EXISTS interim_check_at,
  DROP COLUMN IF EXISTS interim_check_by,
  DROP COLUMN IF EXISTS interim_check_notes,
  DROP COLUMN IF EXISTS interim_notified_at;

ALTER TABLE public.analysis_batch_items
  ADD COLUMN IF NOT EXISTS day3_status text NOT NULL DEFAULT 'pending' CHECK (day3_status IN ('pending', 'clear', 'turbid')),
  ADD COLUMN IF NOT EXISTS day3_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS day3_checked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS day3_notes text,
  ADD COLUMN IF NOT EXISTS day3_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS day7_status text NOT NULL DEFAULT 'pending' CHECK (day7_status IN ('pending', 'clear', 'turbid')),
  ADD COLUMN IF NOT EXISTS day7_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS day7_checked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS day7_notes text,
  ADD COLUMN IF NOT EXISTS day7_notified_at timestamptz;

ALTER TABLE public.sp_settings
  ADD COLUMN IF NOT EXISTS sterility_day3_check_day int NOT NULL DEFAULT 3 CHECK (sterility_day3_check_day > 0),
  ADD COLUMN IF NOT EXISTS sterility_day7_check_day int NOT NULL DEFAULT 7 CHECK (sterility_day7_check_day > 0),
  DROP COLUMN IF EXISTS sterility_interim_check_day;
