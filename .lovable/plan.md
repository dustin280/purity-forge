## Goal

Let analysts switch the Reference Material between **Solid (Purity %)** and **Liquid (Concentration mg/mL)** in the Standard Preparation form. In Liquid mode, the calculator and generated procedure work in **stock aliquot volumes** instead of weighed mass — for liquid primary standards.

Designed to be additive: existing solid-prep records, PDFs, batch views, exports, and the prep-batch server function keep working unchanged.

## Schema change (minimal, additive)

One small migration on `standard_preparation_logs`:
- `ref_form text not null default 'solid'` — values `'solid' | 'liquid'`
- `ref_concentration_mg_per_ml numeric null` — stock concentration when liquid

Reuse the existing `standard_preparation_targets.calculated_volume_ml` column (currently populated but redundant with `target_volume_ml`) to store the **stock aliquot volume** in liquid mode. No new target columns needed.

`ref_purity_percent` and `ref_molecular_weight` stay; they're simply null for liquid prep.

## Form changes (`prep-form-logic.ts`, `prep-calculator-card.tsx`, `use-prep-form.ts`, `prep-form-derive.ts`, `prep-batch-payload.ts`)

1. Add `ref_form: 'solid' | 'liquid'` and `ref_concentration_mg_per_ml: string` to `PrepFormValues` + `emptyPrepValues` (defaults to `'solid'`, `""`).
2. In the Reference Material card, render a small **Form** toggle (Select: Solid / Liquid). The "Purity (%)" field is shown only when Solid; when Liquid it's replaced by "Stock concentration (mg/mL)". Molecular weight stays visible for both.
3. New derivation helper `calcStockVolUl(targetConc, targetVol, stockConc)` → `targetConc * targetVol / stockConc` (mL). Add to `prep-form-logic.ts`.
4. In `deriveCalcRows`, branch on `ref_form`:
   - solid → existing `mass` column populated.
   - liquid → new `stockVolMl` populated; mass left null.
5. Calculator table header swaps the rightmost calc column between **Mass (mg)** and **Stock vol (mL)** based on `ref_form`. Other columns stay identical.
6. `deriveProcedureText` writes liquid-mode instructions:
   - "1. Reference: {name} (Lot {lot}, Received {date}, Stock concentration {conc} mg/mL)."
   - "For {std}: pipette {stockVol mL} of stock standard into final volumetric."
   - "Dilute to {target_vol} mL with {final_diluent}."
7. `prepValuesToPayload` / `valuesToBatchPayload` pass through `ref_form`, `ref_concentration_mg_per_ml`, and write `calculated_volume_ml = stockVolMl` (liquid) or keep current `target_volume_ml` (solid).

## Server function (`prep-batch.functions.ts`, `prep-shared.server.ts`)

- Extend the Zod payload schema to accept `ref_form` and `ref_concentration_mg_per_ml` (nullable). Default `ref_form` to `'solid'` if omitted (back-compat for any in-flight drafts).
- Persist both fields on the log insert. No change to per-target insert logic since `calculated_volume_ml` already exists.

## Read-side updates (light)

- `traceability-snapshot.tsx` and `batch.$groupId.tsx`: when `ref_form === 'liquid'`, show "Stock conc: X mg/mL" instead of "Purity: X%". One ternary per view.
- `standard-preparation-pdf.ts`: same conditional in the reference block.
- `prep-edit-initial.ts`: hydrate the new fields from row data when editing.

## What stays untouched

- Existing solid records load with `ref_form = 'solid'` (default), all current calculations, exports, and review/approval flow are unchanged.
- `material_receipts` link, attachments, status transitions, SYN ID counters — none of these care about ref form.
- No changes to RLS, types regenerate automatically after migration.

## Implementation order

1. Migration (add two columns with safe defaults).
2. Form logic + calculator UI + derive helpers.
3. Server function payload schema + insert.
4. Snapshot / batch view / PDF / edit hydration display tweaks.
5. Manual smoke test: create a solid prep (regression), then a liquid prep (new path), edit each, view PDF.
