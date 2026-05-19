
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'tech', 'reviewer');
CREATE TYPE public.sample_status AS ENUM ('received', 'in_progress', 'reviewed', 'approved');
CREATE TYPE public.test_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'reviewer' THEN 2 WHEN 'tech' THEN 3 END
  LIMIT 1
$$;

-- ============ SAMPLES ============
CREATE TABLE public.samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL UNIQUE,
  client text NOT NULL,
  project text,
  receipt_date date NOT NULL DEFAULT current_date,
  status sample_status NOT NULL DEFAULT 'received',
  notes text,
  raw_data_file_path text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;

-- ============ TESTS ============
CREATE TABLE public.tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  method_name text NOT NULL DEFAULT 'Peptide Purity HPLC-DAD',
  instrument text NOT NULL DEFAULT 'Agilent 1290 DAD',
  parameters jsonb DEFAULT '{}'::jsonb,
  assigned_tech uuid REFERENCES auth.users(id),
  status test_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

-- ============ RESULTS ============
CREATE TABLE public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  purity_percentage numeric(6,3),
  peak_details jsonb DEFAULT '[]'::jsonb,
  raw_data_file_path text,
  analysis_date timestamptz NOT NULL DEFAULT now(),
  analyst_id uuid REFERENCES auth.users(id),
  reviewer_id uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  diff jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============ EXPORT CONFIG ============
CREATE TABLE public.export_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_url text,
  api_key text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  include_lcs boolean NOT NULL DEFAULT true,
  include_ccv boolean NOT NULL DEFAULT true,
  include_method_blank boolean NOT NULL DEFAULT false,
  include_calibration boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.export_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.export_config (webhook_url) VALUES (NULL);

CREATE TABLE public.export_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid REFERENCES public.samples(id) ON DELETE SET NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.export_deliveries ENABLE ROW LEVEL SECURITY;

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_samples_updated BEFORE UPDATE ON public.samples
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tests_updated BEFORE UPDATE ON public.tests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_results_updated BEFORE UPDATE ON public.results
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ AUDIT TRIGGER ============
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec_id uuid;
  diff_data jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_id := OLD.id;
    diff_data := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    rec_id := NEW.id;
    diff_data := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    rec_id := NEW.id;
    diff_data := to_jsonb(NEW);
  END IF;
  INSERT INTO public.audit_log (table_name, record_id, action, changed_by, diff)
  VALUES (TG_TABLE_NAME, rec_id, TG_OP, auth.uid(), diff_data);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_samples_audit AFTER INSERT OR UPDATE OR DELETE ON public.samples
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER trg_tests_audit AFTER INSERT OR UPDATE OR DELETE ON public.tests
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER trg_results_audit AFTER INSERT OR UPDATE OR DELETE ON public.results
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============ HANDLE NEW USER (auto-profile + first user = admin) ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tech');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============
-- profiles: everyone authenticated can read; users update own
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles: users read own; admins read+write all
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- samples: all auth read; tech/admin insert; tech updates own + admin all; reviewer can update status
CREATE POLICY "samples_select_auth" ON public.samples FOR SELECT TO authenticated USING (true);
CREATE POLICY "samples_insert_tech" ON public.samples FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "samples_update_staff" ON public.samples FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "samples_delete_admin" ON public.samples FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- tests
CREATE POLICY "tests_select_auth" ON public.tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "tests_write_staff" ON public.tests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'admin'));

-- results
CREATE POLICY "results_select_auth" ON public.results FOR SELECT TO authenticated USING (true);
CREATE POLICY "results_insert_tech" ON public.results FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "results_update_staff" ON public.results FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'reviewer') OR public.has_role(auth.uid(), 'admin'));

-- audit_log: read all auth, no writes (handled via trigger)
CREATE POLICY "audit_select_auth" ON public.audit_log FOR SELECT TO authenticated USING (true);

-- export_config: admin manage; all auth read
CREATE POLICY "export_config_select" ON public.export_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "export_config_admin" ON public.export_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- export_deliveries: admin/reviewer read
CREATE POLICY "export_deliv_select" ON public.export_deliveries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reviewer'));

-- ============ STORAGE ============
INSERT INTO storage.buckets (id, name, public) VALUES ('raw-data', 'raw-data', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "raw_data_select_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'raw-data');
CREATE POLICY "raw_data_insert_staff" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'raw-data' AND (public.has_role(auth.uid(), 'tech') OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "raw_data_delete_admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'raw-data' AND public.has_role(auth.uid(), 'admin'));
