-- Peak HEIGHT and its companions on the cal/QC peak log.
--
-- Calibration ranges are set from height in mAU (100-1800 on this DAD), not
-- from area, so a log that captured only area could never answer the question
-- it exists to answer. The ACAML parser dropped height entirely until it was
-- re-derived from real integrated .rx files on 2026-08-29.
--
-- `calibration_amount` is the NOMINAL concentration OpenLab recorded for that
-- level (e.g. 0.2 mg/mL), which is what a measured height has to be plotted
-- against. `response_factor` is OpenLab's own response/amount -- flat across
-- levels means linear, a systematic decline means saturation. `symmetry`
-- catches a peak that shouldn't be trusted before its number is used.
ALTER TABLE public.cal_qc_peak_log
  ADD COLUMN IF NOT EXISTS height_mau          numeric,
  ADD COLUMN IF NOT EXISTS height_percent      numeric,
  ADD COLUMN IF NOT EXISTS area_percent        numeric,
  ADD COLUMN IF NOT EXISTS symmetry            numeric,
  ADD COLUMN IF NOT EXISTS response_factor     numeric,
  ADD COLUMN IF NOT EXISTS calibration_amount  numeric,
  ADD COLUMN IF NOT EXISTS identification_type text;

-- The working query is "every height for this compound, by level" — used to
-- check a stored calibration range against what the instrument actually did.
CREATE INDEX IF NOT EXISTS cal_qc_peak_log_compound_level_idx
  ON public.cal_qc_peak_log (compound_id, calibration_amount);
