
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'material_receipt_logs',
    'standard_prep_logs',
    'reagent_prep_logs',
    'sample_prep_logs',
    'qc_prep_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        log_date date NOT NULL DEFAULT CURRENT_DATE,
        employee_name text NOT NULL,
        notes text,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    $f$, t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);
    $f$, t || '_select', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (
        has_role(auth.uid(), 'tech'::app_role)
        OR has_role(auth.uid(), 'reviewer'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
      );
    $f$, t || '_insert', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
        has_role(auth.uid(), 'tech'::app_role)
        OR has_role(auth.uid(), 'reviewer'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
      );
    $f$, t || '_update', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role));
    $f$, t || '_delete', t);

    EXECUTE format($f$
      CREATE TRIGGER %I BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    $f$, t || '_set_updated_at', t);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (log_date DESC);', t || '_log_date_idx', t);
  END LOOP;
END $$;
