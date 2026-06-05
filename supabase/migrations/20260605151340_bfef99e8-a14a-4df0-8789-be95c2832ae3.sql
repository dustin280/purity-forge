
ALTER TABLE public.openlab_settings
  ADD COLUMN IF NOT EXISTS drive_methods_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_sequences_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_last_pulled_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_last_pushed_at timestamptz;

CREATE TABLE public.openlab_drive_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_list_id uuid NOT NULL REFERENCES public.run_lists(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  drive_file_name text NOT NULL,
  pushed_by uuid,
  pushed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.openlab_drive_pushes TO authenticated;
GRANT ALL ON public.openlab_drive_pushes TO service_role;

ALTER TABLE public.openlab_drive_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "odp_select" ON public.openlab_drive_pushes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "odp_insert" ON public.openlab_drive_pushes
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'reviewer'::app_role)
    OR has_role(auth.uid(), 'tech'::app_role)
  );

CREATE INDEX idx_odp_run_list ON public.openlab_drive_pushes(run_list_id, pushed_at DESC);
