## Library — Searchable Reference Table

Add a new **Library** item at the bottom of the main sidebar, backed by a database table seeded from the uploaded peptide/bioregulator/SARM CSV. Admins can add rows and upload more CSVs; all signed-in users can browse, select, view, and print.

### Database (Lovable Cloud)

New table `public.library_items` with columns matching the CSV:
`category, names, cas_number, molecular_weight, molecular_size, size_basis, chemical_formula, sequence, salt_form, termini_modifications, notes, confidence, ambiguity_notes, source_url`, plus `id`, `created_by`, `created_at`, `updated_at`.

- Unique partial indexes for dedupe: lower(cas_number) and lower(names) (where not null).
- RLS: all `authenticated` users SELECT; only admins INSERT/UPDATE/DELETE (via `has_role(auth.uid(), 'admin')`).
- Seed the 87 rows from the attached CSV in the same migration.

### Server functions (`src/lib/library.functions.ts`)

- `listLibraryItems()` — auth, returns all rows.
- `createLibraryItem(row)` — admin-only.
- `updateLibraryItem(id, row)` — admin-only.
- `deleteLibraryItem(id)` — admin-only.
- `bulkUploadLibraryItems(rows)` — admin-only, append + dedupe by lowercased CAS# or Name (skip duplicates, return inserted/skipped counts).

### UI

**Sidebar:** add **Library** (BookOpen icon) at the bottom of `NAV` in `src/components/lims/sidebar-nav.tsx`, route `/library`.

**Route:** `src/routes/_authenticated/library.tsx`

- Top controls: search box (matches name/CAS/formula/sequence/category), category filter dropdown, and (admins only) **Add item** and **Upload CSV** buttons.
- Table with a leading checkbox column + select-all, then key columns (Category, Name, CAS#, MW, Formula, Sequence, Confidence). Row click opens a detail dialog with every field including source URL and notes.
- Footer bar shows selected count + **View selected** and **Print selected** actions (disabled when none selected). A **Print all (filtered)** option is also available.
- Add-item dialog: form with all CSV fields.
- Upload-CSV dialog: file picker, parses client-side, calls bulk upload, shows "X added, Y skipped as duplicates".
- Delete action per row for admins (confirmation prompt).

**Print view:** dedicated `/library/print` route (or a print-only container on the same page) that renders selected rows as a compact landscape-friendly table.
- `@media print { @page { size: landscape; margin: 0.4in; } }` in `src/styles.css`, plus `print:hidden` on sidebar/header/controls and `print:block` on the print table.
- Small font, tight padding, repeats `<thead>` on each page; long fields wrap.

### Files

Created:
- `supabase/migrations/<timestamp>_library_items.sql` (table + grants + RLS + seed)
- `src/lib/library.functions.ts`
- `src/routes/_authenticated/library.tsx`
- `src/components/library/library-table.tsx`
- `src/components/library/add-item-dialog.tsx`
- `src/components/library/upload-csv-dialog.tsx`
- `src/components/library/print-view.tsx`

Edited:
- `src/components/lims/sidebar-nav.tsx` (add Library nav entry at the bottom)
- `src/styles.css` (print styles for landscape)
