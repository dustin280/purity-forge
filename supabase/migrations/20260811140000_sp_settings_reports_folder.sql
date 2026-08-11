-- Results entry needs a Drive folder to pick completed instrument report
-- PDFs from. Reuses the existing lab-settings singleton (sp_settings)
-- rather than a new table, same as the LM-SamplePrep folder before it.
ALTER TABLE public.sp_settings
  ADD COLUMN IF NOT EXISTS drive_lm_reports_complete_folder_id text;
