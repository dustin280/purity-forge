-- Peak metrics are only comparable within one acquisition method.
--
-- Dustin, 2026-08-29: "you cannot compare peak metrics from different
-- acquisition methods. Cals need to be tied to acquisition method first,
-- processing method second." There are several calibration sets per compound
-- and many runs with missing or incomplete processing, so a log keyed on
-- compound alone would silently pool runs that have no business being
-- averaged, and every trend drawn from it would be meaningless.
--
-- Method identity therefore belongs on the row, and every aggregate must
-- partition by it. `acq_method_name` is the hard boundary; a query that
-- groups without it is a bug.
ALTER TABLE public.cal_qc_peak_log
  ADD COLUMN IF NOT EXISTS acq_method_name        text,
  ADD COLUMN IF NOT EXISTS processing_method_name text,
  -- Injection-level processing state from the .rx, so a run that was never
  -- fully processed is visibly excluded rather than quietly averaged in.
  ADD COLUMN IF NOT EXISTS processing_state       text;

-- The only safe grouping: one compound, one acquisition method, by level.
CREATE INDEX IF NOT EXISTS cal_qc_peak_log_method_scope_idx
  ON public.cal_qc_peak_log (compound_id, acq_method_name, calibration_amount);

COMMENT ON COLUMN public.cal_qc_peak_log.acq_method_name IS
  'Acquisition method. Peak area/height are NOT comparable across different values here -- always partition by this column.';
COMMENT ON COLUMN public.cal_qc_peak_log.processing_method_name IS
  'Processing method (integration/compound table). Secondary partition: same raw data, different integration.';
