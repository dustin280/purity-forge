## Part-number lookup in Add Inventory

Add a "Search part database" input at the top of each FieldGrid (main item + each component) on `/inventory/new`. The user types a part number, clicks Search (or hits Enter), and we try to match it against:

1. **HPLC columns CSVs** — Agilent, Waters, Phenomenex (via `loadVendorColumns` in `src/lib/maintenance/columns.ts`).
2. **Agilent instrument parts CSV** — via `loadParts` in `src/lib/maintenance/parts.ts`.

### Match logic
- Normalize: trim, uppercase, strip spaces/dashes.
- Exact match first on normalized part number.
- If none, substring match (typed value contained in a CSV part number) — first hit wins.
- Search columns first, then parts. (Columns are more specific; parts catalog is large.)

### When a match is found
Auto-fill the FieldGrid fields:
- **Column match** → `make` = vendor label (Agilent/Waters/Phenomenex), `model` = `name` (or productFamily), `description` = compact summary (specs/ID/length/particle), and a small note saying "Matched HPLC column".
- **Part match** → `make` = "Agilent" (the parts CSV is Agilent-only), `model` = part number, `description` = `description` from CSV + module/subsystem context.
- Show a green confirmation chip with the matched source and a "Clear" button to revert.
- Do NOT touch user-entered serial number, dates, installer initials, or status — only the catalog-derived fields.

### When no match is found
- Show an amber "No match — enter manually" message and leave the user's typed value populated into `model` (or `serial_number`? — defaulting to `model`) as a starting point. Fields stay editable.

### Implementation
- New helper `src/lib/inventory/part-lookup.ts` exporting `lookupPartNumber(pn: string): { source: "column" | "part" | "none"; values?: Partial<FieldSet>; label?: string }`. Pure client-side — uses the existing CSV loaders, no DB or server fn needed.
- Update `src/routes/_authenticated/inventory/new.tsx`:
  - Add a `PartLookup` sub-component rendered inside `FieldGrid` (or above it) with input + Search button + status line.
  - On match, call `onChange({...value, ...matchedValues})` to merge into the field set.

### Out of scope
- Searching by name/description (only by part number, per request).
- Editing the CSV catalogs.
- Showing all match candidates / picker UI (first/best match auto-applies; user can edit afterward).
