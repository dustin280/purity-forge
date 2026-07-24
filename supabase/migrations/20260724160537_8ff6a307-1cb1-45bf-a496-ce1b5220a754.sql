
-- Counter
CREATE TABLE public.sp_preparation_counters (
  day date PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.sp_preparation_counters TO authenticated;
GRANT ALL ON public.sp_preparation_counters TO service_role;
ALTER TABLE public.sp_preparation_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_prep_counters_read" ON public.sp_preparation_counters FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_sp_prep_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := (now() AT TIME ZONE 'UTC')::date;
  n int;
BEGIN
  INSERT INTO public.sp_preparation_counters(day, last_seq)
  VALUES (d, 1)
  ON CONFLICT (day) DO UPDATE SET last_seq = sp_preparation_counters.last_seq + 1
  RETURNING last_seq INTO n;
  RETURN 'SP-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 3, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_sp_prep_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_sp_prep_number() TO authenticated, service_role;

-- Header
CREATE TABLE public.sp_preparation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_number text NOT NULL UNIQUE,
  method_revision_id uuid NOT NULL REFERENCES public.sp_method_revisions(id) ON DELETE RESTRICT,
  analyte_id uuid NOT NULL REFERENCES public.sp_analytes(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_progress','awaiting_review','approved','rejected')),
  planned_target_concentration_mg_per_ml numeric,
  planned_target_volume_ul numeric,
  planned_calibration_level int,
  sample_id text,
  lot_number text,
  sample_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  solvent_formulation_id uuid REFERENCES public.sp_solvent_formulations(id) ON DELETE SET NULL,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  prepared_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prepared_at timestamptz,
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_comment text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_preparation_records TO authenticated;
GRANT ALL ON public.sp_preparation_records TO service_role;
ALTER TABLE public.sp_preparation_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_prep_records_read_all" ON public.sp_preparation_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sp_prep_records_insert_own" ON public.sp_preparation_records
  FOR INSERT TO authenticated WITH CHECK (prepared_by = auth.uid());

CREATE POLICY "sp_prep_records_update_own_or_reviewer" ON public.sp_preparation_records
  FOR UPDATE TO authenticated USING (
    (prepared_by = auth.uid() AND status IN ('draft','in_progress','awaiting_review','rejected'))
    OR public.has_role(auth.uid(),'reviewer')
    OR public.has_role(auth.uid(),'admin')
  ) WITH CHECK (
    (prepared_by = auth.uid() AND status IN ('draft','in_progress','awaiting_review','rejected'))
    OR public.has_role(auth.uid(),'reviewer')
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "sp_prep_records_delete_draft_or_admin" ON public.sp_preparation_records
  FOR DELETE TO authenticated USING (
    (prepared_by = auth.uid() AND status = 'draft')
    OR public.has_role(auth.uid(),'admin')
  );

CREATE INDEX sp_prep_records_status_idx ON public.sp_preparation_records(status);
CREATE INDEX sp_prep_records_prepared_by_idx ON public.sp_preparation_records(prepared_by);
CREATE INDEX sp_prep_records_created_idx ON public.sp_preparation_records(created_at DESC);

CREATE TRIGGER sp_prep_records_set_updated_at
  BEFORE UPDATE ON public.sp_preparation_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Steps
CREATE TABLE public.sp_preparation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.sp_preparation_records(id) ON DELETE CASCADE,
  step_no int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('reconstitute','dilute','aliquot')),
  planned jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_mass_mg numeric,
  actual_volume_ul numeric,
  actual_diluent_ul numeric,
  actual_final_volume_ul numeric,
  actual_conc_mg_per_ml numeric,
  vessel_id uuid REFERENCES public.sp_vessels(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES public.sp_equipment(id) ON DELETE SET NULL,
  balance_id uuid REFERENCES public.sp_equipment(id) ON DELETE SET NULL,
  reagent_lot_id uuid REFERENCES public.sp_reagent_lots(id) ON DELETE SET NULL,
  solvent_lot_id uuid REFERENCES public.sp_reagent_lots(id) ON DELETE SET NULL,
  performed_at timestamptz,
  performed_by_initials text,
  deviation_flag boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, step_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_preparation_steps TO authenticated;
GRANT ALL ON public.sp_preparation_steps TO service_role;
ALTER TABLE public.sp_preparation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_prep_steps_read_all" ON public.sp_preparation_steps
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sp_prep_steps_write_by_preparer_or_reviewer" ON public.sp_preparation_steps
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sp_preparation_records r
      WHERE r.id = sp_preparation_steps.record_id
        AND (
          (r.prepared_by = auth.uid() AND r.status IN ('draft','in_progress','awaiting_review','rejected'))
          OR public.has_role(auth.uid(),'reviewer')
          OR public.has_role(auth.uid(),'admin')
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sp_preparation_records r
      WHERE r.id = sp_preparation_steps.record_id
        AND (
          (r.prepared_by = auth.uid() AND r.status IN ('draft','in_progress','awaiting_review','rejected'))
          OR public.has_role(auth.uid(),'reviewer')
          OR public.has_role(auth.uid(),'admin')
        )
    )
  );

CREATE INDEX sp_prep_steps_record_idx ON public.sp_preparation_steps(record_id);

CREATE TRIGGER sp_prep_steps_set_updated_at
  BEFORE UPDATE ON public.sp_preparation_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
