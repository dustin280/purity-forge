## Standard Prep Log — searchable, sortable, filterable table view

Convert the current card list at `/lab-logs/standard-preparations` into a data table with sortable columns, expanded filters, a Date Created column, and default sort by SYN ID (newest first).

### Changes

**1. Server function — `listStandardPreparations`** (`src/lib/standard-preparations/prep-crud.functions.ts`)
- Add optional `sortBy` (`syn_id` | `log_number` | `prepared_at` | `created_at` | `standard_name` | `analyst_name` | `status`) and `sortDir` (`asc` | `desc`) inputs.
- Default sort: `syn_id desc nullslast` (newest SYN ID first), tiebreak `created_at desc`.
- Keep existing `q`, `status`, `from`, `to` filters. Add optional `analyst` filter.

**2. Replace `PrepsList` with `PrepsTable`** (`src/components/standard-preparations/preps-table.tsx`, new)
- shadcn `Table` with columns: SYN ID, Log #, Standard, Analyst, Prepared, **Created**, Conc, Lot, Status, ›.
- Each column header is a button toggling sort asc/desc with chevron indicator.
- Row click → navigate to detail page (keep existing link behavior).
- Empty + loading states preserved.
- Old `preps-list.tsx` deleted.

**3. Extend `PrepsFiltersCard`** (`src/components/standard-preparations/preps-filters-card.tsx`)
- Already has search, status, from/to. Add an Analyst text filter input.
- Search remains client-driven via debounced query param to server.

**4. Index route** (`src/routes/_authenticated/lab-logs/standard-preparations/index.tsx`)
- Add `sortBy` / `sortDir` state (default `syn_id` / `desc`), pass into filters, render `PrepsTable`.
- Query key extended to include sort.

### Technical notes

- `qk.standardPreps.list(filters)` already takes a filters object — extend the type to include sort + analyst; no key shape change beyond that.
- Supabase order: `.order("syn_id", { ascending: false, nullsFirst: false })` then `.order("created_at", { ascending: false })`.
- "Date Created" = `created_at` column (already on the row); "Prepared" stays as `prepared_at`.
- No DB migration needed.
- Detail page, new prep form, batch view: untouched.
