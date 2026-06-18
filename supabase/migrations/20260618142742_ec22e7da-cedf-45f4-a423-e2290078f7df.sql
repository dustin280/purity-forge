
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('instrument','column','accessory','other')),
  make text,
  model text,
  serial_number text,
  description text,
  purchase_date date,
  installation_date date,
  installer_initials text,
  status text NOT NULL DEFAULT 'in_use' CHECK (status IN ('in_use','working_not_in_use','discarded')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_items_select_auth" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_items_insert_staff" ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "inventory_items_update_staff" ON public.inventory_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "inventory_items_delete_staff" ON public.inventory_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER inventory_items_set_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_items_audit AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TABLE public.inventory_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  make text,
  model text,
  serial_number text,
  description text,
  purchase_date date,
  installation_date date,
  installer_initials text,
  status text NOT NULL DEFAULT 'in_use' CHECK (status IN ('in_use','working_not_in_use','discarded')),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_components TO authenticated;
GRANT ALL ON public.inventory_components TO service_role;
CREATE INDEX inventory_components_item_id_idx ON public.inventory_components(item_id);
ALTER TABLE public.inventory_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_components_select_auth" ON public.inventory_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_components_insert_staff" ON public.inventory_components FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "inventory_components_update_staff" ON public.inventory_components FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "inventory_components_delete_staff" ON public.inventory_components FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'tech') OR public.has_role(auth.uid(),'reviewer') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER inventory_components_set_updated_at BEFORE UPDATE ON public.inventory_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_components_audit AFTER INSERT OR UPDATE OR DELETE ON public.inventory_components
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
