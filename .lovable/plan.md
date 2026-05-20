
## Goal

Add a "Standard Preparation Calculator" that:
1. Pulls reference material from approved Material Receipts (with purity / MW / receipt date)
2. Calculates weights & volumes for many target standards at once
3. Generates a fully-traceable, copy-able step-by-step procedure
4. Saves to the Standard Preparation Log, linked to the source receipt (one receipt → many preps)
5. Shows all standards prepared from each Material Receipt on the receipt's detail page

## Database changes

**Add columns to `material_receipts`** (needed for auto-fill):
- `purity_percent numeric` — e.g. 99.5
- `molecular_weight numeric` — g/mol
- `shelf_life_months int` (optional, default 24) — for the "material is old" warning

**New table `standard_preparation_targets`** (one prep → many target standards, supports 50+ rows):
- `id uuid pk`
- `prep_id uuid` → `standard_preparation_logs.id` (cascade delete)
- `row_no int`
- `name text` (the target / desired standard label, e.g. "Working std #1")
- `target_concentration_mg_per_ml numeric`
- `target_volume_ml numeric`
- `calculated_mass_mg numeric` (purity-corrected)
- `calculated_volume_ml numeric`
- `notes text`
- RLS: tech/reviewer/admin write, all auth read (matches sibling tables)

**Extend `standard_preparation_logs`** for calculator traceability:
- `expiration_period_code text` — `1w | 2w | 4w | 3m | 6m | custom`
- `expiration_period_days int` — resolved days used (so the value is auditable even if presets change)
- `initial_solvent text`
- `final_diluent text` (default suggestion "HPLC Grade Water + 0.1% TFA" — set in form, not DB default)
- `modifier_percent numeric`
- `material_overridden boolean default false` — true when user edits an auto-filled field
- Snapshot fields captured at save time (so deleting/editing the receipt later doesn't break the log):
  - `ref_material_name text`, `ref_lot text`, `ref_purity_percent numeric`,
    `ref_molecular_weight numeric`, `ref_receipt_date date`

The existing `material_receipt_id` foreign-key column already gives us the one-to-many relation.

## Server functions (`src/lib/standard-preparations.functions.ts`)

- Extend `searchMaterialReceiptsForLink` → only return rows where `approved_at IS NOT NULL` AND `quarantine_status = 'released'`, and include `purity_percent`, `molecular_weight`, `received_at`, `shelf_life_months`.
- Add `listPrepsForReceipt({ receipt_id })` — used on the Material Receipt detail page.
- Extend `createStandardPreparation` / `updateStandardPreparation` payload + handler to accept the new fields and an array of `targets`, written transactionally (insert log, then insert children).
- Extend `getStandardPreparation` to return `targets`.

## Calculator UI

New component `src/components/standard-preparations/prep-calculator.tsx` rendered above (or inside) `PrepForm` on the New Preparation page.

Sections:

1. **Reference Material**
   - Searchable combobox (reuses `searchMaterialReceiptsForLink`, now filtered to approved).
   - On select, auto-fills: ref name, lot, purity %, MW, receipt date — each field shows a small "Overridden" badge if the user edits it after auto-fill (sets `material_overridden=true`).
   - "View Linked Receipt" button → opens `/material-receipts/$id` in a new tab.

2. **Expiration Settings**
   - Period dropdown: 1 week / 2 weeks (default) / 4 weeks / 3 months / 6 months / Custom.
   - Custom days numeric input when "Custom".
   - Read-only computed Expiration Date = prepared_at + period.
   - Warning banner when `today − receipt_date > shelf_life_months` OR when expiration would exceed receipt-based shelf life.

3. **Diluent & Solvent**
   - Initial Solvent, Final Diluent (preset "HPLC Grade Water + 0.1% TFA"), Modifier %.

4. **Desired Standards table** (dynamic, virtualized-friendly):
   - Columns: # / Name / Target conc (mg/mL) / Target volume (mL) / Calculated mass (mg) / Calculated volume (mL) / Notes / Remove.
   - "+ Add row", "+ Add 10 rows", paste-from-clipboard helper (TSV → rows) for bulk entry.
   - Inline calc: `mass_mg = (target_conc × target_volume) / (purity/100)`; volume column used for serial-dilution rows.

5. **Calculate Preparation** button → recomputes all rows and renders:
   - **Calculated Results Table** (read-only echo of the rows).
   - **Step-by-Step Procedure** with traceability text (includes ref name, lot, receipt date, purity, and a link token resolved to `/material-receipts/$id`).
   - **Traceability Summary Box**: receipt link, receipt date, prep date & analyst, expiration date, totals.
   - **Copy** buttons on procedure text and summary (clipboard).

6. **Save This Preparation to Log** → reuses `createStandardPreparation` with the new payload (writes log row + targets, snapshots ref material fields). Redirects to the prep detail page on success.

## Material Receipt detail page

Add a "Standards Prepared From This Receipt" card (uses `listPrepsForReceipt`): table of log #, standard name, prepared date, analyst, expiration, status; each row links to the prep detail. Empty state when none.

## Styling / UX

- Reuses existing `Card`, `Input`, `Select`, `Button`, `Badge` — visual parity with other lab-log pages.
- Mobile: stack sections; targets table becomes horizontally scrollable with sticky first column.
- Toasts for save/copy actions; disabled "Save" until a reference material is selected (or explicitly overridden).

## Out of scope

- No new PDF layout — existing prep PDF will include the new fields once they're on the row. Targets table can be added to the PDF in a follow-up if you want.
- No change to the approval workflow.

## Files to add / change

- `supabase/migrations/<new>.sql` — new columns + new table + RLS.
- `src/lib/standard-preparations.functions.ts` — schema, listPrepsForReceipt, target-array handling.
- `src/components/standard-preparations/prep-calculator.tsx` — new.
- `src/components/standard-preparations/prep-form.tsx` — wire calculator fields into `PrepFormValues` and payload.
- `src/routes/_authenticated/lab-logs/standard-preparations/new.tsx` — render calculator above the form (or as the primary view).
- `src/routes/_authenticated/lab-logs/standard-preparations/$id.tsx` — render targets table + traceability snapshot.
- `src/routes/_authenticated/material-receipts/$id.tsx` — "Standards Prepared From This Receipt" card.

Ready to implement on approval.
