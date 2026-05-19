CREATE TABLE public.sftp_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host text NOT NULL DEFAULT '',
  port integer NOT NULL DEFAULT 22,
  username text NOT NULL DEFAULT '',
  password text,
  private_key text,
  remote_path text NOT NULL DEFAULT '/',
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sftp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY sftp_config_admin ON public.sftp_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER sftp_config_updated_at
BEFORE UPDATE ON public.sftp_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();