-- Replaces the per-sample sterility_preps flow (zero rows in production,
-- confirmed safe to drop) with a generic batch-level process record:
-- analysts select every sample due for a given non-HPLC test from a queue,
-- prep/inoculate them together, and the whole event (media lots, incubator(s)
-- + temps, inoculation amount, clock-start) is captured as one record.
-- test_type is a free-text discriminator (only 'sterility' populated today)
-- so future non-HPLC test types reuse this same table pair.

DROP TABLE IF EXISTS public.sterility_preps;

CREATE TABLE public.analysis_batch_counters (
  test_type text PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.analysis_batch_counters TO authenticated;
GRANT ALL ON public.analysis_batch_counters TO service_role;
ALTER TABLE public.analysis_batch_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth counters" ON public.analysis_batch_counters FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.next_analysis_batch_seq(p_test_type text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.analysis_batch_counters(test_type, last_seq)
  VALUES (p_test_type, 1)
  ON CONFLICT (test_type) DO UPDATE SET last_seq = analysis_batch_counters.last_seq + 1
  RETURNING last_seq INTO n;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.next_analysis_batch_seq(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_analysis_batch_seq(text) TO authenticated, service_role;

CREATE TABLE public.analysis_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_type text NOT NULL,
  batch_number text NOT NULL UNIQUE,
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  method text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  incubation_started_at timestamptz,
  interim_check_status text NOT NULL DEFAULT 'pending' CHECK (interim_check_status IN ('pending', 'clear', 'turbid')),
  interim_check_at timestamptz,
  interim_check_by uuid REFERENCES auth.users(id),
  interim_check_notes text,
  interim_notified_at timestamptz,
  readout_notified_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'reviewed')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_batches_test_type_idx ON public.analysis_batches (test_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_batches TO authenticated;
GRANT ALL ON public.analysis_batches TO service_role;
ALTER TABLE public.analysis_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read analysis batches" ON public.analysis_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "operational write analysis batches" ON public.analysis_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER analysis_batches_updated_at BEFORE UPDATE ON public.analysis_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.analysis_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.analysis_batches(id) ON DELETE CASCADE,
  test_id uuid NOT NULL UNIQUE REFERENCES public.tests(id) ON DELETE CASCADE,
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  storage_slot_id uuid REFERENCES public.storage_slots(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_batch_items_batch_id_idx ON public.analysis_batch_items (batch_id);
CREATE INDEX analysis_batch_items_sample_id_idx ON public.analysis_batch_items (sample_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_batch_items TO authenticated;
GRANT ALL ON public.analysis_batch_items TO service_role;
ALTER TABLE public.analysis_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read analysis batch items" ON public.analysis_batch_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "operational write analysis batch items" ON public.analysis_batch_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));
