ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS received_form text CHECK (received_form IN ('lyophilized', 'solution')),
  ADD COLUMN IF NOT EXISTS received_quantity numeric,
  ADD COLUMN IF NOT EXISTS received_quantity_unit text,
  ADD COLUMN IF NOT EXISTS received_purity_percent numeric;

ALTER TABLE public.compounds
  ADD COLUMN IF NOT EXISTS sp_analyte_id uuid REFERENCES public.sp_analytes(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sp_method_prep_rules_default_sample_solvent_id_fkey'
  ) THEN
    ALTER TABLE public.sp_method_prep_rules
      ADD CONSTRAINT sp_method_prep_rules_default_sample_solvent_id_fkey
        FOREIGN KEY (default_sample_solvent_id) REFERENCES public.sp_solvent_formulations(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.sp_settings
  ADD COLUMN IF NOT EXISTS drive_lm_sample_prep_folder_id text;