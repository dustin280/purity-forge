-- Partner (Wayne) needs a CAS number + molecular formula catalogue for the
-- certificate's static identifier line (2026-08-27, "certificate-blocking
-- on our side"). Separate concern from the per-lot export API contract --
-- this is reference data on the compound itself, not a result field.
alter table compounds
  add column if not exists cas_number text,
  add column if not exists molecular_formula text;
