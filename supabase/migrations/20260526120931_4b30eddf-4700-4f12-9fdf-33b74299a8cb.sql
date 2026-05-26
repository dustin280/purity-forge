
-- 1. Tags column on lab_journal_entries
ALTER TABLE public.lab_journal_entries
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS lab_journal_entries_tags_idx
  ON public.lab_journal_entries USING GIN (tags);

-- 2. Attachments table
CREATE TABLE IF NOT EXISTS public.lab_journal_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.lab_journal_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lab_journal_attachments_entry_idx
  ON public.lab_journal_attachments(entry_id);

ALTER TABLE public.lab_journal_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY lja_select ON public.lab_journal_attachments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY lja_insert ON public.lab_journal_attachments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY lja_delete ON public.lab_journal_attachments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 3. Private storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('lab-journal-attachments', 'lab-journal-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: scope to {user_id}/... path prefix
CREATE POLICY "lja_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lab-journal-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "lja_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lab-journal-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "lja_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lab-journal-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );
