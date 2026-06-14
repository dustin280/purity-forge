## Vial Labels — phase 1

A new menu item that takes a list of label texts (uploaded from .txt / .csv / .xlsx) and lays them out on a printable label sheet matching the attached template (R001 / LS-0100F — 160 small labels per sheet, US Letter), with a live preview and a Print button.

### Sidebar / route
- Add `Vial Labels` nav item (Tags icon) in `src/components/lims/sidebar-nav.tsx`, under Operations, route `/vial-labels`.
- New route file `src/routes/_authenticated/vial-labels.tsx`.
- No backend, no DB. Pure frontend feature.

### Page UI
1. **File upload** card — drag/drop or picker, accepts `.txt`, `.csv`, `.xlsx`.
   - `.txt` → one label per non-empty line.
   - `.csv` → first column of each row (header auto-detected and skipped if it looks like a header).
   - `.xlsx` → first sheet, first column, same rule. Parsed with `xlsx` (SheetJS) — added via `bun add xlsx`.
2. **Editable list** — parsed entries shown in a textarea so the user can tweak, reorder, or paste directly without a file. Counter shows `N labels · M sheets` (160 per sheet).
3. **Options** (small, sensible defaults):
   - Start position (skip first N label slots — for reusing a partially used sheet).
   - Font size (auto-fit by default, with a manual override).
4. **Actions**: `Preview` (always live) and `Print` button → `window.print()` scoped to the preview area via a print-only CSS class on `<body>` toggled while printing.

### Label sheet rendering (the "template")
Rather than mail-merging the .docx (LibreOffice/docx generation isn't available in the Worker runtime and gives no in-browser preview), we replicate the template's geometry in HTML/CSS, which prints pixel-accurate from the browser:

- Page: 8.5" × 11", margins top 0.5", left/right 0.25", bottom 0" (from template's `pgMar`).
- Grid: 160 labels per sheet (template's actual count), laid out as a CSS grid of label cells sized 1" × 0.5" (template's `tblGrid` 1439 dxa wide × 719 dxa tall ≈ 1" × 0.5"). Final column/row counts will be set to match the template's per-page count after rendering one filled sheet against the original .docx side-by-side.
- Each label cell: centered text, no border on print, dashed light border in on-screen preview only (so users can see empty slots). Auto-shrink text to fit (binary-search font-size between 6pt and the user-selected max).
- Footer on each printed sheet: `THESHIPPINGSTORE.COM  -  TEMPLATE R001` (matches the template) — toggleable.

A `@media print` block hides the app chrome (sidebar, header, controls) and shows only the label sheets, one per CSS page using `page-break-after: always`.

### Files
- `src/routes/_authenticated/vial-labels.tsx` — route + page shell.
- `src/components/vial-labels/upload-card.tsx` — file picker + parsing.
- `src/components/vial-labels/list-editor.tsx` — textarea + counts.
- `src/components/vial-labels/options-card.tsx` — start offset, font size, footer toggle.
- `src/components/vial-labels/label-sheet.tsx` — printable sheet renderer (auto-fit text).
- `src/components/vial-labels/parse-list.ts` — txt/csv/xlsx parsers.
- `src/components/lims/sidebar-nav.tsx` — add nav entry.
- `package.json` — add `xlsx`.

### Out of scope (for later phases, per your note)
- Saving label batches to the database.
- Multiple template choices / custom label dimensions.
- Barcode/QR generation.
- Per-label fields beyond a single text value.

### Open question
The current rendering only fills a single text per label. If a vial label needs multiple lines (e.g. compound name + lot + date) per label, say so and I'll switch the parser to map columns → lines (column A = line 1, column B = line 2, etc.) before building.
