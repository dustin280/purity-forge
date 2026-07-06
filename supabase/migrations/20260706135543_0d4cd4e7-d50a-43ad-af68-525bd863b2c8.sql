ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS part_number text;
ALTER TABLE public.inventory_components ADD COLUMN IF NOT EXISTS part_number text;