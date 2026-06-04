ALTER TABLE public.daily_backpressure_logs
  ADD COLUMN injections_count integer,
  ADD COLUMN mobile_phase text,
  ADD COLUMN flow_rate numeric,
  ADD COLUMN flow_rate_unit text DEFAULT 'mL/min',
  ADD COLUMN column_temp numeric,
  ADD COLUMN column_temp_unit text DEFAULT 'C',
  ADD COLUMN column_name text;