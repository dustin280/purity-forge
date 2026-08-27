-- Market/shorthand names (e.g. "RETA", "SS31") that resolve to a canonical
-- compound, so the partner intake portal can match on the same identity
-- purity-forge uses instead of free-text guessing (2026-08-27).
alter table compounds add column if not exists aliases text[];
