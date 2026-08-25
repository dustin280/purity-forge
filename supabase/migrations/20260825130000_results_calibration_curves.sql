-- Multi-compound blend reports (e.g. SUMMIT) embed one calibration curve
-- image + fit-stats block per compound, not one per report. Every layer
-- reading calibration data only ever handled a single value:
--   - the chromatogram-converter agent only extracted the first embedded
--     calibration picture out of a report's several,
--   - the xlsx text parser only read the report's first worksheet, and
--     blend reports put the per-compound calibration blocks on a second
--     worksheet entirely, so calibration_data came back nearly empty.
-- Both are fixed upstream (converter + parser). This column holds the
-- full per-compound set once merged: [{compound, image, data}, ...].
--
-- calibration_image/calibration_data stay as-is, still populated from the
-- first/primary curve -- nothing that reads only those two (partner
-- export API, older UI code) needs to change to keep working.
alter table public.results
  add column if not exists calibration_curves jsonb;

comment on column public.results.calibration_curves is
  'Full per-compound calibration curve set for blend reports: [{compound, image, data}]. calibration_image/calibration_data hold the first entry for backward compatibility.';
