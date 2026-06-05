
ALTER TABLE public.openlab_settings
  ADD COLUMN IF NOT EXISTS drive_reports_folder_id text;

CREATE TABLE IF NOT EXISTS public.openlab_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  relative_path text not null,
  last_modified timestamptz,
  size_bytes bigint,
  synced_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.openlab_reports TO authenticated;
GRANT ALL ON public.openlab_reports TO service_role;

ALTER TABLE public.openlab_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "openlab_reports select all auth"
  ON public.openlab_reports FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "openlab_reports admin write"
  ON public.openlab_reports FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
