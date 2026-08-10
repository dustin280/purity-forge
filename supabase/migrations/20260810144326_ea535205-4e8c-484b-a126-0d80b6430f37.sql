ALTER TABLE public.tray_configs
  ADD COLUMN IF NOT EXISTS drawer_count int NOT NULL DEFAULT 4
    CHECK (drawer_count BETWEEN 1 AND 4);