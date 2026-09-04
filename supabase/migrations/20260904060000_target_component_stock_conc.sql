-- Stock concentration per standard-set component, so the cut sheet can say
-- what each pipetted volume was drawn from ("NAD µL / stock 5 mg/mL" in the
-- column header). Older records have null here and print without the line.
alter table public.standard_preparation_target_components
  add column if not exists stock_concentration_mg_per_ml numeric null;
comment on column public.standard_preparation_target_components.stock_concentration_mg_per_ml is
  'Concentration of the primary stock the aliquot was drawn from (mg/mL); printed under the compound in the cut sheet µL column header.';
