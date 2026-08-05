-- Adds optional acceptance-criteria range to tests so results can show a real
-- pass/fail verdict instead of an always-green purity number. No default
-- values are set — a test with no spec on file is shown as "no spec on file"
-- in the UI, not a false pass or fail.
ALTER TABLE public.tests
  ADD COLUMN spec_min numeric(6,3),
  ADD COLUMN spec_max numeric(6,3);

ALTER TABLE public.tests
  ADD CONSTRAINT tests_spec_range_valid
  CHECK (spec_min IS NULL OR spec_max IS NULL OR spec_min <= spec_max);
