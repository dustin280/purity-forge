
-- Settings (singleton row)
CREATE TABLE public.openlab_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  project_folder_path text NOT NULL DEFAULT '',
  storage_prefix text NOT NULL DEFAULT 'default/',
  last_synced_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.openlab_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "openlab_settings select all auth" ON public.openlab_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "openlab_settings admin write" ON public.openlab_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER openlab_settings_updated_at BEFORE UPDATE ON public.openlab_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Methods cache
CREATE TABLE public.openlab_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  relative_path text NOT NULL,
  last_modified timestamptz,
  size_bytes bigint,
  synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.openlab_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "openlab_methods select all auth" ON public.openlab_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "openlab_methods admin write" ON public.openlab_methods FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Sequences cache
CREATE TABLE public.openlab_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Unknown',
  relative_path text NOT NULL,
  last_modified timestamptz,
  line_count int NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.openlab_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "openlab_sequences select all auth" ON public.openlab_sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "openlab_sequences admin write" ON public.openlab_sequences FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('openlab-cds', 'openlab-cds', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "openlab-cds read auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'openlab-cds');
CREATE POLICY "openlab-cds admin write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'openlab-cds' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "openlab-cds admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'openlab-cds' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "openlab-cds admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'openlab-cds' AND public.has_role(auth.uid(), 'admin'));

-- Seed singleton settings row
INSERT INTO public.openlab_settings (singleton, project_folder_path, storage_prefix)
VALUES (true, '', 'default/')
ON CONFLICT (singleton) DO NOTHING;
