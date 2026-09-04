-- What OpenLab tells the instrument about each injection. About two minutes
-- before an injection the workstation invokes SetRunInformation on its port-80
-- WebSocket (sample name, sample type, method, sequence, vial, operator,
-- project); agent 1.3.0 attaches it to the run. Shown above the chromatogram
-- on the Live page; the method name also fills daily_backpressure_logs.
-- acquisition_method for live rows.
alter table public.instrument_runs
  add column if not exists sample_name text null,
  add column if not exists sample_type text null,
  add column if not exists method_name text null,
  add column if not exists sequence_name text null,
  add column if not exists run_info jsonb null;
comment on column public.instrument_runs.run_info is
  'OpenLab SetRunInformation for this injection, normalised by the agent (sample_name, sample_type, method_name, method_id, sequence_name, vial, user_name, project_name, preview, baseline_check, received_at).';
