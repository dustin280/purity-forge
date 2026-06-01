
-- =========================================================
-- timesheet_projects (admin-managed dropdown list)
-- =========================================================
CREATE TABLE public.timesheet_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheet_projects TO authenticated;
GRANT ALL ON public.timesheet_projects TO service_role;

ALTER TABLE public.timesheet_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tsp_select ON public.timesheet_projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY tsp_admin_write ON public.timesheet_projects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_timesheet_projects_updated_at
  BEFORE UPDATE ON public.timesheet_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a few common project options
INSERT INTO public.timesheet_projects (name, sort_order) VALUES
  ('General Lab Work', 10),
  ('Method Development', 20),
  ('Sample Analysis', 30),
  ('Administration', 40),
  ('Training', 50),
  ('Maintenance', 60);

-- =========================================================
-- timesheet_entries
-- =========================================================
CREATE TABLE public.timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  entry_date date NOT NULL,
  project text NOT NULL,
  task_description text NOT NULL,
  duration_hours numeric(6,2) NOT NULL,
  start_time time NULL,
  end_time time NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timesheet_entries_duration_range CHECK (duration_hours > 0 AND duration_hours <= 24)
);

CREATE INDEX idx_timesheet_entries_user_date
  ON public.timesheet_entries (user_id, entry_date DESC);
CREATE INDEX idx_timesheet_entries_project
  ON public.timesheet_entries (user_id, project);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheet_entries TO authenticated;
GRANT ALL ON public.timesheet_entries TO service_role;

ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tse_select ON public.timesheet_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY tse_insert ON public.timesheet_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY tse_update ON public.timesheet_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY tse_delete ON public.timesheet_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_timesheet_entries_updated_at
  BEFORE UPDATE ON public.timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
