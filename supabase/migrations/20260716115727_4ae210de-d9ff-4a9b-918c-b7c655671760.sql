
CREATE TABLE public.partner_webhook_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  secret TEXT NOT NULL,
  secret_preview TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated','revoked')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deprecated_at TIMESTAMPTZ,
  grace_until TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX partner_webhook_secrets_one_active
  ON public.partner_webhook_secrets (status)
  WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_webhook_secrets TO authenticated;
GRANT ALL ON public.partner_webhook_secrets TO service_role;

ALTER TABLE public.partner_webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook secrets"
  ON public.partner_webhook_secrets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert webhook secrets"
  ON public.partner_webhook_secrets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update webhook secrets"
  ON public.partner_webhook_secrets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete webhook secrets"
  ON public.partner_webhook_secrets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
