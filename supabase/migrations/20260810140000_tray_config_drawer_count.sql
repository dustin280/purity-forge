-- Instruments can have fewer than the max 4 drawers (8 trays); Bobbie has
-- all 4. Make drawer count a real per-tray-config setting instead of the
-- hardcoded, incomplete 4-tray assumption the seeding logic used before.
ALTER TABLE public.tray_configs
  ADD COLUMN IF NOT EXISTS drawer_count int NOT NULL DEFAULT 4
    CHECK (drawer_count BETWEEN 1 AND 4);
