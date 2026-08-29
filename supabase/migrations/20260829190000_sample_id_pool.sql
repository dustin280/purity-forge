-- Sample IDs must form an unbroken sequence. Before this, every number
-- handed out was gone for good: opening a New Sample Receipt burned one
-- immediately, and cancelling a pending order stranded the one it had
-- reserved. Six of the first twelve SYX numbers were dead that way, which
-- is not something you want to have to explain in an audit.
--
-- An ID is now RELEASED back to a pool when the thing that claimed it goes
-- away, and the next allocation takes the lowest pooled id before touching
-- the counter. Reuse is only ever allowed for an id that never reached a
-- real record -- see release_sample_id's guards.

CREATE TABLE IF NOT EXISTS public.sample_id_pool (
  sample_id text PRIMARY KEY,
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid,
  -- Why it came back ('draft_discarded', 'order_cancelled', 'backfill').
  -- Kept so the reuse of a number is explainable after the fact.
  reason text
);

GRANT SELECT, INSERT, DELETE ON public.sample_id_pool TO authenticated;
GRANT ALL ON public.sample_id_pool TO service_role;
ALTER TABLE public.sample_id_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sample id pool" ON public.sample_id_pool
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write sample id pool" ON public.sample_id_pool
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allocate: lowest pooled id first, else advance the counter.
CREATE OR REPLACE FUNCTION public.next_coc_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recycled text;
  v_n bigint;
BEGIN
  -- SKIP LOCKED so two concurrent intakes can't be handed the same id;
  -- the second one simply moves on to the next pooled row or the counter.
  DELETE FROM public.sample_id_pool
   WHERE sample_id = (
     SELECT sample_id FROM public.sample_id_pool
      ORDER BY sample_id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING sample_id INTO v_recycled;

  IF v_recycled IS NOT NULL THEN
    RETURN v_recycled;
  END IF;

  UPDATE public.syx_batch_id_counter
     SET last_number = last_number + 1
   WHERE id = 1
  RETURNING last_number INTO v_n;

  RETURN 'SYX-' || lpad(v_n::text, 6, '0');
END;
$$;

-- Release: only for an id that never became a real record. Guarded rather
-- than trusted, because a reused id that already has samples or a CoC
-- behind it would be a genuine traceability failure -- far worse than a
-- gap.
CREATE OR REPLACE FUNCTION public.release_sample_id(p_sample_id text, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_sample_id IS NULL OR p_sample_id !~ '^SYX-\d{6}$' THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.samples WHERE batch_id LIKE p_sample_id || '-%') THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chain_of_custody_records WHERE sample_id = p_sample_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sample_lots WHERE shipment_id = p_sample_id) THEN
    RETURN false;
  END IF;
  -- Still spoken for by a live pending order.
  IF EXISTS (
    SELECT 1 FROM public.pending_orders
     WHERE reserved_sample_id = p_sample_id AND status = 'pending'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.sample_id_pool (sample_id, released_by, reason)
  VALUES (p_sample_id, auth.uid(), p_reason)
  ON CONFLICT (sample_id) DO NOTHING;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_sample_id(text, text) TO authenticated;

-- Backfill the holes that already exist, so the next intakes consume them
-- instead of pushing the sequence further out.
INSERT INTO public.sample_id_pool (sample_id, reason)
SELECT 'SYX-' || lpad(n::text, 6, '0'), 'backfill'
FROM generate_series(1, (SELECT last_number FROM public.syx_batch_id_counter WHERE id = 1)) AS n
WHERE NOT EXISTS (
        SELECT 1 FROM public.samples s
         WHERE s.batch_id LIKE 'SYX-' || lpad(n::text, 6, '0') || '-%')
  AND NOT EXISTS (
        SELECT 1 FROM public.chain_of_custody_records c
         WHERE c.sample_id = 'SYX-' || lpad(n::text, 6, '0'))
  AND NOT EXISTS (
        SELECT 1 FROM public.pending_orders p
         WHERE p.reserved_sample_id = 'SYX-' || lpad(n::text, 6, '0')
           AND p.status = 'pending')
ON CONFLICT (sample_id) DO NOTHING;
