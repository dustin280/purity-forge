ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_status_check;
ALTER TABLE public.inventory_components DROP CONSTRAINT IF EXISTS inventory_components_status_check;

UPDATE public.inventory_items SET status = 'in_service' WHERE status = 'in_use';
UPDATE public.inventory_items SET status = 'out_of_service' WHERE status = 'working_not_in_use';
UPDATE public.inventory_components SET status = 'in_service' WHERE status = 'in_use';
UPDATE public.inventory_components SET status = 'out_of_service' WHERE status = 'working_not_in_use';

ALTER TABLE public.inventory_items ALTER COLUMN status SET DEFAULT 'in_service';
ALTER TABLE public.inventory_components ALTER COLUMN status SET DEFAULT 'in_service';

ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_status_check
  CHECK (status IN ('in_service','out_of_service','discarded'));
ALTER TABLE public.inventory_components ADD CONSTRAINT inventory_components_status_check
  CHECK (status IN ('in_service','out_of_service','discarded'));