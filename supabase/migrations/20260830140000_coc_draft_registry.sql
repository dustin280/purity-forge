-- Cross-machine visibility for in-progress Sample Receipts.
--
-- Drafts live in localStorage, which is per-browser: a receipt started on the
-- bench laptop is invisible from the office PC. Two people can therefore work
-- the same physical shipment at once, each burning a Sample ID, and neither
-- can see the other. The Sample ID sequence itself is server-side so the ids
-- never collide -- the risk is duplicated effort and a shipment entered twice.
--
-- This table is a REGISTRY, not the draft store. The full draft (and its
-- photos, which are large and live in IndexedDB) stays local; what syncs is
-- enough to answer "is someone already working this?" -- who, which Sample ID,
-- which pending order, and when they last touched it. Resuming still happens
-- on the machine that holds the draft, and the registry says which one that
-- is.
CREATE TABLE IF NOT EXISTS public.coc_draft_registry (
  draft_id           text PRIMARY KEY,
  sample_id          text,
  pending_order_id   uuid,
  record_id          uuid,
  summary            text,
  device_label       text,
  photo_count        integer NOT NULL DEFAULT 0,
  created_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coc_draft_registry_sample_id_idx
  ON public.coc_draft_registry (sample_id);
CREATE INDEX IF NOT EXISTS coc_draft_registry_pending_order_idx
  ON public.coc_draft_registry (pending_order_id);

ALTER TABLE public.coc_draft_registry ENABLE ROW LEVEL SECURITY;

-- Everyone in the lab can see every in-progress receipt -- that visibility is
-- the entire point. Only the author can change or remove their own row.
DROP POLICY IF EXISTS coc_draft_registry_select ON public.coc_draft_registry;
CREATE POLICY coc_draft_registry_select ON public.coc_draft_registry
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS coc_draft_registry_insert ON public.coc_draft_registry;
CREATE POLICY coc_draft_registry_insert ON public.coc_draft_registry
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS coc_draft_registry_update ON public.coc_draft_registry;
CREATE POLICY coc_draft_registry_update ON public.coc_draft_registry
  FOR UPDATE TO authenticated USING (created_by = auth.uid());

DROP POLICY IF EXISTS coc_draft_registry_delete ON public.coc_draft_registry;
CREATE POLICY coc_draft_registry_delete ON public.coc_draft_registry
  FOR DELETE TO authenticated USING (created_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coc_draft_registry TO authenticated;

DROP TRIGGER IF EXISTS set_updated_at_coc_draft_registry ON public.coc_draft_registry;
CREATE TRIGGER set_updated_at_coc_draft_registry
  BEFORE UPDATE ON public.coc_draft_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
