-- Global toggle for whether an analyst may review their own result (the
-- Results tab's "Review" button hides itself when the reviewer would be
-- the same person as the submitting analyst, unless this is on). Off by
-- default so nothing changes for anyone until an admin explicitly enables
-- it -- same singleton-table pattern as queue_config.

CREATE TABLE IF NOT EXISTS public.review_config (
  id boolean PRIMARY KEY DEFAULT true,
  allow_self_review boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_config_singleton CHECK (id = true)
);

GRANT SELECT, INSERT, UPDATE ON public.review_config TO authenticated;
GRANT ALL ON public.review_config TO service_role;

ALTER TABLE public.review_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_config_select_auth" ON public.review_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "review_config_write_admin" ON public.review_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_review_config_updated
  BEFORE UPDATE ON public.review_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.review_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
