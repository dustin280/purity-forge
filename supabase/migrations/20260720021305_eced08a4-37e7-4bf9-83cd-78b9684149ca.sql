
-- Fix 1: Remove redundant permissive policies on standard_preparation_targets
DROP POLICY IF EXISTS prep_targets_insert ON public.standard_preparation_targets;
DROP POLICY IF EXISTS prep_targets_update ON public.standard_preparation_targets;
DROP POLICY IF EXISTS prep_targets_delete ON public.standard_preparation_targets;

-- Fix 2: Revoke anon/public execute on SECURITY DEFINER trigger function
REVOKE EXECUTE ON FUNCTION public.assign_material_receipt_internal_lot() FROM PUBLIC, anon;

-- Fix 3: Tighten always-true RLS policies for INSERT/UPDATE/DELETE
-- solvent_options: restrict inserts to staff
DROP POLICY IF EXISTS solvent_opts_insert ON public.solvent_options;
CREATE POLICY solvent_opts_insert ON public.solvent_options
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- modifier_options: restrict inserts to staff
DROP POLICY IF EXISTS modifier_opts_insert ON public.modifier_options;
CREATE POLICY modifier_opts_insert ON public.modifier_options
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'reviewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- run_list_daily_counters: writes happen via SECURITY DEFINER function next_run_list_seq (bypasses RLS).
-- Restrict direct access to admins only.
DROP POLICY IF EXISTS "auth counters" ON public.run_list_daily_counters;
CREATE POLICY run_list_counters_admin ON public.run_list_daily_counters
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
