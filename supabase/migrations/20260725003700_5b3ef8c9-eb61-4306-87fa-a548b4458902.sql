DO $$ BEGIN
  CREATE TYPE public.sp_attachment_kind AS ENUM
    ('weighing','label','photo','sequence','coa','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.sp_preparation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.sp_preparation_records(id) ON DELETE CASCADE,
  kind public.sp_attachment_kind NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sp_prep_att_record ON public.sp_preparation_attachments(record_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_preparation_attachments TO authenticated;
GRANT ALL ON public.sp_preparation_attachments TO service_role;

ALTER TABLE public.sp_preparation_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY spa_sp_select ON public.sp_preparation_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY spa_sp_insert ON public.sp_preparation_attachments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));
CREATE POLICY spa_sp_delete ON public.sp_preparation_attachments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin'));

CREATE POLICY "sp_prep_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sample-preparations');
CREATE POLICY "sp_prep_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sample-preparations'
    AND (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin')));
CREATE POLICY "sp_prep_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sample-preparations'
    AND (has_role(auth.uid(),'tech') OR has_role(auth.uid(),'reviewer') OR has_role(auth.uid(),'admin')));
