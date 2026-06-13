## Rename "Chain of Custody" to "Sample Receipt" (UI labels only — Option 1)

### Goal
Replace every user-facing "Chain of Custody" label with "Sample Receipt" without renaming files, routes, database tables, storage buckets, or the `COC…` invoice prefix. Zero breakage risk.

### Files to edit

| File | What changes |
|------|-------------|
| `src/components/chain-of-custody/page-header.tsx` | Page heading `Chain of Custody` → `Sample Receipt`; button `New Chain of Custody` → `New Sample Receipt` |
| `src/components/lims/sidebar-nav.tsx` | Sidebar nav label `Chain of Custody` → `Sample Receipt` |
| `src/routes/_authenticated/chain-of-custody.tsx` | Route comment |
| `src/routes/_authenticated/intake.tsx` | Description: "received Chain of Custody records" → "received Sample Receipt records" |
| `src/routes/_authenticated/clients/index.tsx` | Description: "used by the Chain of Custody form" → "used by the Sample Receipt form" |
| `src/routes/_authenticated/admin/index.tsx` | Tile title `Chain of Custody Fields` → `Sample Receipt Fields`; description |
| `src/routes/_authenticated/admin/coc-fields.tsx` | Page title + description |
| `src/routes/_authenticated/admin/parameters.tsx` | Description text |
| `src/components/chain-of-custody/coc-view-dialog.tsx` | Dialog title `Chain of Custody` → `Sample Receipt` |
| `src/components/chain-of-custody/use-coc-form.ts` | Toast message + comments |
| `src/components/chain-of-custody/types.ts` | Comments |
| `src/components/chain-of-custody/records-list.tsx` | Comments |
| `src/components/chain-of-custody/coc-form-dialog.tsx` | Comments |
| `src/components/intake/queue-list.tsx` | Empty-state text |
| `src/lib/coc-pdf.ts` | PDF heading `Chain of Custody` → `Sample Receipt` + comments |
| `src/lib/clients.functions.ts` | Comments |

### What does NOT change
- File names, component names, function names (`coc-*`, `Coc*`, `useCoc*`, etc.)
- Route paths (`/chain-of-custody`, `/admin/coc-fields`)
- Database tables (`chain_of_custody_records`, `chain_of_custody_fields`, `coc_attachments`)
- Storage bucket name for attachments
- Invoice prefix (`COC…`) on existing records
- All `coc` / `COC` / `CoC` variable names and code identifiers

### Validation
After edits, run a search to confirm no remaining user-facing "Chain of Custody" strings exist in rendered UI (comments may remain in some places).