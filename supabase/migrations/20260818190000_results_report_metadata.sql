-- Report-header fields that don't belong to any one compound/peak row
-- (data file, operator, instrument, injection volume, location,
-- acquisition/processing method, sample amount, signal, etc.), captured
-- alongside peak_details so the partner export payload can carry the full
-- report rather than just the compound table. See
-- src/lib/results/drive-reports.functions.ts (ParsedReport.report_metadata).
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS report_metadata jsonb;
