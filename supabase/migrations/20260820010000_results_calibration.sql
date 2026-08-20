-- Calibration curve data from the "Calibration Update" block the report
-- template now includes (fit stats + a second embedded chart image,
-- alongside the chromatogram). Mirrors chromatogram_image/report_metadata's
-- existing pattern on this table.
ALTER TABLE public.results ADD COLUMN calibration_image text;
ALTER TABLE public.results ADD COLUMN calibration_data jsonb;
