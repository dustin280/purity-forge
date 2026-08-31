-- Standard sets can now serve a level from an intermediate stock instead of
-- the primary, when the primary would demand an aliquot below the pipette
-- floor. Record which stock each component was actually drawn from.
--
-- Additive and nullable: existing rows are all primary draws, and a null
-- reads as "primary" everywhere it's consumed.
alter table public.standard_preparation_target_components
  add column if not exists source_label text;

comment on column public.standard_preparation_target_components.source_label is
  'Which stock this aliquot was drawn from, e.g. "CTG primary" or "CTG 1:10". Null means the primary stock.';

-- The intermediate stocks themselves (what to make, from what, in what order)
-- are written to standard_preparation_logs.preparation_steps, which is
-- already jsonb and was previously always an empty array for this prep type.
