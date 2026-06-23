ALTER TABLE public.inventory_items ADD COLUMN is_spare boolean NOT NULL DEFAULT false;
ALTER TABLE public.inventory_components ADD COLUMN is_spare boolean NOT NULL DEFAULT false;