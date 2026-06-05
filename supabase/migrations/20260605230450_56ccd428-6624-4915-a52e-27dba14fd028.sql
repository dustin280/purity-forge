
CREATE TABLE public.parameter_scouting_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.parameter_scouting_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parameter_scouting_attachments_entry_idx ON public.parameter_scouting_attachments(entry_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parameter_scouting_attachments TO authenticated;
GRANT ALL ON public.parameter_scouting_attachments TO service_role;

ALTER TABLE public.parameter_scouting_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psa_select" ON public.parameter_scouting_attachments
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "psa_insert" ON public.parameter_scouting_attachments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "psa_delete" ON public.parameter_scouting_attachments
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "psa_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'parameter-scouting-attachments'
    AND (((storage.foldername(name))[1] = (auth.uid())::text) OR has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "psa_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'parameter-scouting-attachments'
    AND ((storage.foldername(name))[1] = (auth.uid())::text)
  );

CREATE POLICY "psa_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'parameter-scouting-attachments'
    AND (((storage.foldername(name))[1] = (auth.uid())::text) OR has_role(auth.uid(), 'admin'::app_role))
  );
