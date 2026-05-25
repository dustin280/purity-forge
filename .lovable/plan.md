## Goal

Add a per-row **unit selector** for the "Conc" column in the Desired Standards table, with `mg/mL` and `mg/L` as the two starting options, structured so more units (e.g. `µg/mL`, `ng/mL`, `µM`) can be added later in one place.

## Approach

Storage stays normalized in **mg/mL** (the existing `target_concentration_mg_per_ml` column), so all downstream calculations, PDFs, batch logic, and historical records keep working unchanged. We add a new field that remembers the unit the user typed in, used purely for display and edit.

### 1. Units registry (single source of truth)

New file `src/components/standard-preparations/target-units.ts`:

```ts
export type ConcUnit = "mg/mL" | "mg/L";
export const CONC_UNITS: { value: ConcUnit; label: string; toMgPerMl: number }[] = [
  { value: "mg/mL", label: "mg/mL", toMgPerMl: 1 },
  { value: "mg/L",  label: "mg/L",  toMgPerMl: 0.001 },
];
// helpers: toMgPerMl(value, unit), fromMgPerMl(mgPerMl, unit)
```

Adding a future unit = one line in this array.

### 2. Form values

In `prep-form-logic.ts`, extend `TargetRow`:
- add `target_concentration_unit: ConcUnit` (default `"mg/mL"`)
- `emptyTarget()` sets it to `"mg/mL"`
- `prepValuesToPayload`: convert the typed value through `toMgPerMl(...)` before writing to `target_concentration_mg_per_ml` (DB stays in mg/mL).

### 3. Derivations

In `prep-form-derive.ts`:
- `deriveCalcRows`: convert each row's input to mg/mL before computing mass / stock volume (no math change, just normalization).
- `deriveProcedureText`: when echoing the target concentration in text, render it in the user's chosen unit.

### 4. UI — `prep-calculator-card.tsx`

In the Desired Standards table:
- Replace the static `Conc (mg/mL)` header with `Concentration`.
- The concentration cell becomes an input + a compact `Select` populated from `CONC_UNITS`.
- Changing the unit only updates `target_concentration_unit`; it does NOT re-scale the number the user typed (so switching mg/mL ↔ mg/L treats the entered value as the new unit's value — same UX as a calculator).
- Mass / Stock vol cell unchanged (still computed in mg / mL).

### 5. Paste support

`pasteTargets` in `use-prep-form.ts` currently parses tab/CSV rows assuming mg/mL. Keep that assumption — pasted rows default to `"mg/mL"`. No change to paste format.

### 6. Persistence + edit hydration

- **Migration:** add column `target_concentration_unit text not null default 'mg/mL'` to `standard_preparation_targets`. Existing rows back-fill to `'mg/mL'`.
- Server: extend `payloadSchema` and `batchPayloadSchema` target item with `target_concentration_unit: z.enum(["mg/mL","mg/L"]).default("mg/mL")`; insert it alongside the existing target columns.
- `prep-edit-initial.ts`: hydrate `target_concentration_unit` from the row (fallback `"mg/mL"`); convert the stored mg/mL value back into the chosen unit for display via `fromMgPerMl`.

### 7. Read-side display

- `targets-table.tsx` (detail view), `traceability-snapshot.tsx`, `standard-preparation-pdf.ts`, batch view: show the concentration in its original unit (e.g. `"5 mg/L"`) using the stored unit + converted value. Falls back gracefully for legacy rows (unit = mg/mL).

## What stays untouched

- All existing calculations (mass, stock volume, dilution math) — they keep operating in mg/mL internally.
- DB column `target_concentration_mg_per_ml` and all queries against it.
- Solid/liquid reference toggle, status flow, RLS, batch logic.
- Existing saved records — they read back as `mg/mL` because of the column default.

## Files touched

- **New:** `src/components/standard-preparations/target-units.ts`
- **Edit:** `prep-form-logic.ts`, `prep-form-derive.ts`, `prep-calculator-card.tsx`, `use-prep-form.ts`, `prep-edit-initial.ts`, `prep-batch-payload.ts`, `targets-table.tsx`, `traceability-snapshot.tsx`
- **Edit (server):** `src/lib/standard-preparations/prep-shared.server.ts`, `prep-batch.functions.ts`, `prep-crud.functions.ts`, `src/lib/standard-preparation-pdf.ts`
- **Migration:** add `target_concentration_unit` column to `standard_preparation_targets`.
