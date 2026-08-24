-- Material Receipts rollout of the shared document numbering system (see
-- 20260824090000_document_numbering_system.sql). Repurposes receipt_number
-- to carry SYN-MREC-######-MMDDYY instead of the old daily-reset
-- REC-YYYYMMDD-NNN counter; drops the counter it replaces.

ALTER TABLE public.material_receipts ALTER COLUMN receipt_number DROP DEFAULT;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, received_at FROM public.material_receipts ORDER BY received_at, created_at LOOP
    UPDATE public.material_receipts
    SET receipt_number = public.register_document('MREC', 'material_receipts', r.id, r.received_at::date)
    WHERE id = r.id;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.next_material_receipt_number();
DROP TABLE IF EXISTS public.material_receipt_counters;
