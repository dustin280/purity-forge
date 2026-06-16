## Plan: Maintenance menu + Part Picker

### 1. Add Maintenance section to sidebar
- In `src/components/lims/sidebar-nav.tsx`, add a new "Maintenance" nav entry (Wrench icon) pointing to `/maintenance` in the Operations group (or as its own section).

### 2. Maintenance landing + Part Picker routes
- `src/routes/_authenticated/maintenance/index.tsx` — landing page with cards/tiles for each maintenance tool. First card: "Part Picker" → `/maintenance/part-picker`. Built as a tile grid so adding future items is a one-line change.
- `src/routes/_authenticated/maintenance/part-picker.tsx` — the Part Picker page.

### 3. Parts data (kept flexible for later edits)
- Copy the uploaded CSV to `src/data/agilent-parts.csv` (static asset, imported as raw text via Vite `?raw`).
- Parse client-side with a tiny CSV parser (handles quoted commas) into typed rows. No backend / DB — easy to swap the file or migrate to a DB table later.
- Define a `PartRow` type matching the 9 columns.

### 4. Part Picker UI
- Search input: filters across all columns (case-insensitive, debounced).
- Filter dropdowns: Module/Category and Subsystem/Assembly (derived from data).
- Table (shadcn `Table`) with sortable headers, columns:
  Module, Subsystem, Description, Part #, Replaces, Status, Torque/Service Note, Where to Buy (rendered as live `<a target="_blank" rel="noopener noreferrer">` "Buy" link with external-link icon when URL present), Notes.
- Row count + "Clear filters" button.
- Horizontal scroll on small screens; sticky header.

### 5. Flexibility hooks for later
- Parts source isolated in `src/lib/maintenance/parts.ts` (load + parse). Swapping to Supabase later = replace that module only.
- Maintenance landing uses a `TILES` array, mirroring the admin index pattern, so new maintenance tools drop in with one entry + one route file.

### Technical notes
- No new dependencies; reuse shadcn `Input`, `Select`, `Table`, `Card`, `Button`, lucide `Wrench`, `ExternalLink`, `Search`.
- CSV imported via `import partsCsv from "@/data/agilent-parts.csv?raw"` — Vite supports `?raw` out of the box.
- No server functions, no migrations.
