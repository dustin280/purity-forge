-- Fixed lab distribution list for new-sample-intake email/SMS alerts. One
-- row per person; each picks email, SMS, or both independently. Modeled on
-- method_groups' RLS/grant/trigger pattern.
CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  notify_email boolean NOT NULL DEFAULT true,
  notify_sms boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_recipients_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read notification recipients" ON public.notification_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write notification recipients" ON public.notification_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER notification_recipients_updated_at BEFORE UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
