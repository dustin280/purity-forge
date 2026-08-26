-- Compounds interface groundwork (2026-08-26): add wavelength preference
-- and separate Standard Prep / Sample Prep modification notes, since the
-- default diluent and other prep defaults can legitimately differ between
-- the two contexts for the same compound.
alter table compounds
  add column if not exists wavelength_nm numeric,
  add column if not exists sp_std_notes text,
  add column if not exists sp_smp_notes text;
