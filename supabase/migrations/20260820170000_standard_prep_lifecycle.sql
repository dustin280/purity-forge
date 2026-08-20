-- Track A3: volume-remaining tracking + lifecycle state for standard preps.
-- Only meaningful where final_volume_ml is a real number (the three guided
-- flows) — legacy Batch calculator rows have no final_volume_ml and simply
-- won't show lifecycle tracking in the UI.
ALTER TABLE public.standard_preparation_logs
  ADD COLUMN IF NOT EXISTS volume_remaining_ml numeric,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'in_use'
    CHECK (lifecycle_status IN ('in_use', 'depleted', 'discarded'));

-- Backfill existing guided-flow rows: everything prepared so far is fully
-- available until a usage event says otherwise.
UPDATE public.standard_preparation_logs
SET volume_remaining_ml = final_volume_ml
WHERE final_volume_ml IS NOT NULL AND volume_remaining_ml IS NULL;

CREATE TABLE public.standard_preparation_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_id uuid NOT NULL REFERENCES public.standard_preparation_logs(id) ON DELETE CASCADE,
  withdrawn_ml numeric NOT NULL CHECK (withdrawn_ml > 0),
  purpose text,
  notes text,
  actor_id uuid,
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX standard_preparation_usage_log_prep_id_idx
  ON public.standard_preparation_usage_log(prep_id);
GRANT SELECT, INSERT ON public.standard_preparation_usage_log TO authenticated;
GRANT ALL ON public.standard_preparation_usage_log TO service_role;
ALTER TABLE public.standard_preparation_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY standard_prep_usage_log_read ON public.standard_preparation_usage_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY standard_prep_usage_log_insert ON public.standard_preparation_usage_log
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- Single atomic decrement path — avoids a read-modify-write race between
-- two analysts drawing from the same bottle at once, and is the one place
-- that keeps volume_remaining_ml and lifecycle_status in sync with the log.
CREATE OR REPLACE FUNCTION public.record_standard_usage(
  p_prep_id uuid, p_withdrawn_ml numeric, p_actor_id uuid, p_actor_name text,
  p_purpose text, p_notes text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE remaining numeric;
BEGIN
  UPDATE public.standard_preparation_logs
  SET volume_remaining_ml = GREATEST(0, COALESCE(volume_remaining_ml, 0) - p_withdrawn_ml),
      lifecycle_status = CASE
        WHEN GREATEST(0, COALESCE(volume_remaining_ml, 0) - p_withdrawn_ml) <= 0 THEN 'depleted'
        ELSE lifecycle_status
      END
  WHERE id = p_prep_id
  RETURNING volume_remaining_ml INTO remaining;

  IF remaining IS NULL THEN
    RAISE EXCEPTION 'Preparation % not found or has no tracked volume', p_prep_id;
  END IF;

  INSERT INTO public.standard_preparation_usage_log
    (prep_id, withdrawn_ml, purpose, notes, actor_id, actor_name)
  VALUES (p_prep_id, p_withdrawn_ml, p_purpose, p_notes, p_actor_id, p_actor_name);

  RETURN remaining;
END;
$$;
REVOKE ALL ON FUNCTION public.record_standard_usage(uuid, numeric, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_standard_usage(uuid, numeric, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.discard_standard_prep(
  p_prep_id uuid, p_actor_name text, p_reason text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.standard_preparation_logs
  SET lifecycle_status = 'discarded',
      notes = CASE WHEN p_reason IS NOT NULL AND p_reason <> ''
        THEN COALESCE(notes || E'\n', '') || 'Discarded by ' || p_actor_name || ': ' || p_reason
        ELSE notes END
  WHERE id = p_prep_id;
$$;
REVOKE ALL ON FUNCTION public.discard_standard_prep(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_standard_prep(uuid, text, text) TO authenticated;
