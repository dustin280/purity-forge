-- Expand the Library into a real cross-registry reference resource
-- (2026-08-27, Dustin: "I want this to be a real library"). Adds the
-- identifier schemes CAS# alone doesn't cover, plus a literature pointer.
alter table library_items
  add column if not exists pubchem_cid text,
  add column if not exists unii text,
  add column if not exists inchikey text,
  add column if not exists smiles text,
  add column if not exists inn_usan_name text,
  add column if not exists drugbank_id text,
  add column if not exists chembl_id text,
  add column if not exists atc_code text,
  add column if not exists research_summary text,
  add column if not exists key_references text;
