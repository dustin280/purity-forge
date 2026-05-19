
-- Add per-vial columns to samples
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS container_size text,
  ADD COLUMN IF NOT EXISTS concentration text,
  ADD COLUMN IF NOT EXISTS catalog text;

-- CoC attachments (package photos, etc.)
CREATE TABLE IF NOT EXISTS public.coc_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coc_id uuid NOT NULL REFERENCES public.chain_of_custody_records(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coc_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY coca_select ON public.coc_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY coca_insert ON public.coc_attachments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY coca_delete ON public.coc_attachments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR uploaded_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_coc_attachments_coc_id ON public.coc_attachments(coc_id);

-- Storage bucket for CoC attachments (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('coc-attachments', 'coc-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "coc_attachments_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'coc-attachments');
CREATE POLICY "coc_attachments_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'coc-attachments');
CREATE POLICY "coc_attachments_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'coc-attachments');

-- Deactivate the 5 header fields that should be per-line-item
UPDATE public.chain_of_custody_fields
SET is_active = false
WHERE field_key IN ('product_name','catalog_code','lot_batch_number','quantity_received','container_size');
