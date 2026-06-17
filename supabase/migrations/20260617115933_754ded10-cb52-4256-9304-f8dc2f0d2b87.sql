
-- 1. export_config: admin-only SELECT
DROP POLICY IF EXISTS export_config_select ON public.export_config;
CREATE POLICY export_config_select ON public.export_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. audit_log: admin or reviewer only
DROP POLICY IF EXISTS audit_select_auth ON public.audit_log;
CREATE POLICY audit_select_admin_reviewer ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'reviewer'::app_role)
  );

-- 3. clients & client_contacts: restrict SELECT to staff roles
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'tech'::app_role)
    OR public.has_role(auth.uid(), 'reviewer'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS cc_select ON public.client_contacts;
CREATE POLICY cc_select ON public.client_contacts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'tech'::app_role)
    OR public.has_role(auth.uid(), 'reviewer'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 4. Counter tables: enable RLS + explicit deny-all (only SECURITY DEFINER fns may touch them)
ALTER TABLE public.mobile_phase_prep_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY counters_deny_all ON public.mobile_phase_prep_counters
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE POLICY counters_deny_all ON public.material_receipt_counters
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE POLICY counters_deny_all ON public.standard_preparation_counters
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE POLICY counters_deny_all ON public.syn_id_counters
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- 5. Storage policies for coc-attachments bucket
DROP POLICY IF EXISTS coc_attachments_read ON storage.objects;
DROP POLICY IF EXISTS coc_attachments_delete ON storage.objects;
DROP POLICY IF EXISTS coc_attachments_write ON storage.objects;

CREATE POLICY coc_attachments_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'coc-attachments'
    AND (
      public.has_role(auth.uid(), 'tech'::app_role)
      OR public.has_role(auth.uid(), 'reviewer'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY coc_attachments_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'coc-attachments'
    AND (
      public.has_role(auth.uid(), 'tech'::app_role)
      OR public.has_role(auth.uid(), 'reviewer'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY coc_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'coc-attachments'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 6. Revoke EXECUTE on internal SECURITY DEFINER functions from API roles
REVOKE EXECUTE ON FUNCTION public.next_mobile_phase_prep_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.next_material_receipt_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.next_standard_preparation_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.next_syn_id(text, date) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_instrument_booking_overlap() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.validate_instrument_booking() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_client_contacts_limit() FROM anon, authenticated, public;

-- Role-check helpers: needed by authenticated for RLS evaluation; remove anon access
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
