-- Compound-level appearance default (e.g. "White cake", "Blue cake") --
-- auto-fills the sample's Physical Description at intake and stays editable
-- everywhere so a reviewer can record an actual defect (2026-08-27).
alter table compounds add column if not exists default_appearance text;
