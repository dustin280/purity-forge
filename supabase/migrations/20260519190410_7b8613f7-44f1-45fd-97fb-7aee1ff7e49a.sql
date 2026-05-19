
-- Issue reports / lab notes
CREATE TABLE public.issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  user_name text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY ir_select ON public.issue_reports
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ir_insert ON public.issue_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'tech'::app_role)
    OR public.has_role(auth.uid(), 'reviewer'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY ir_update ON public.issue_reports
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR created_by = auth.uid()
  );

CREATE POLICY ir_delete ON public.issue_reports
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_issue_reports_updated_at
  BEFORE UPDATE ON public.issue_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Attachments
CREATE TABLE public.issue_report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issue_reports(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.issue_report_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ira_select ON public.issue_report_attachments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ira_insert ON public.issue_report_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'tech'::app_role)
    OR public.has_role(auth.uid(), 'reviewer'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY ira_delete ON public.issue_report_attachments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR uploaded_by = auth.uid()
  );

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-reports', 'issue-reports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "issue_reports_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'issue-reports');

CREATE POLICY "issue_reports_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'issue-reports' AND (
      public.has_role(auth.uid(), 'tech'::app_role)
      OR public.has_role(auth.uid(), 'reviewer'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "issue_reports_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'issue-reports' AND (
      public.has_role(auth.uid(), 'admin'::app_role) OR owner = auth.uid()
    )
  );
