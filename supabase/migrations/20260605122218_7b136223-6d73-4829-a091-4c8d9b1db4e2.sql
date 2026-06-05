
-- Clients directory
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL UNIQUE,
  address text,
  primary_contact_name text,
  primary_contact_title text,
  primary_contact_email text,
  primary_contact_phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Additional contacts (up to 10 per client enforced at app + trigger)
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_select ON public.client_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY cc_insert ON public.client_contacts FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY cc_update ON public.client_contacts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY cc_delete ON public.client_contacts FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER client_contacts_set_updated_at BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX client_contacts_client_id_idx ON public.client_contacts (client_id);

-- Enforce maximum of 10 additional contacts per client
CREATE OR REPLACE FUNCTION public.enforce_client_contacts_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM public.client_contacts WHERE client_id = NEW.client_id;
  IF cnt >= 10 THEN
    RAISE EXCEPTION 'A client can have at most 10 additional contacts';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_contacts_limit
  BEFORE INSERT ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_contacts_limit();

-- Add Client Address field to Chain of Custody form (after client_contact_phone)
INSERT INTO public.chain_of_custody_fields (field_key, label, field_type, is_required, is_active, sort_order, placeholder)
VALUES ('client_address', 'Client Address', 'textarea', false, true, 85, 'Street, city, state, postal code, country')
ON CONFLICT DO NOTHING;
