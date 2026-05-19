
REVOKE ALL ON FUNCTION public.next_material_receipt_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_material_receipt_number() TO authenticated;
