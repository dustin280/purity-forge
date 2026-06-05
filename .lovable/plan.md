## Goal

Let an analyst flag samples as "ready for instrument run", assemble them into an ordered run list (picking instrument / method / starting vial position), and export an OpenLab CDS sequence CSV — either downloaded in the browser now, or POSTed to an on-prem agent later.

## 1. Database

New migration:

- `samples.prep_flag boolean not null default false` — quick flag on the sample row.
- `samples.prep_flagged_at timestamptz`, `samples.prep_flagged_by uuid` — light audit.
- `run_list_columns` (admin-managed extra columns appended to the exported CSV):
  - `key text` (CSV header), `label text`, `source` enum (`literal`, `sample_field`, `method`, `vial`, `data_file_pattern`), `default_value text`, `sample_field text` nullable, `sort_order int`, `is_active bool`.
  - Seeded with the OpenLab CDS Workstation/Server standard set: Sample Name, Sample Type, Method, Inj/Vial, Vial, Data File, Sample Info, Level, Sample Amount, ISTD Amount, Multiplier, Dilution, Comment.
- `run_lists` — saved/exported run lists:
  - `name text`, `instrument_id uuid` (→ `instruments`), `method_name text`, `starting_vial int`, `inj_per_vial int default 1`, `data_file_pattern text` (e.g. `{sample}_{yyyyMMdd}_{seq}`), `notes text`, `status text default 'draft'` (`draft` | `exported`), `exported_at timestamptz`, `exported_by uuid`, `csv_storage_path text` nullable, `created_by`, timestamps.
- `run_list_items` — ordered samples in a list:
  - `run_list_id uuid` (cascade), `sample_id uuid` (→ `samples`), `row_no int`, `sample_type text default 'Sample'`, `method_override text`, `vial int`, `data_file text`, `comment text`, `extras jsonb default '{}'`.
- RLS: select for any authenticated user; insert/update for tech/reviewer/admin; delete admin (matches the rest of the LIMS). Standard GRANTs.
- Trigger on `run_list_items` to keep `row_no` consecutive on insert if not provided.

## 2. Server functions

`src/lib/run-lists.functions.ts` (createServerFn + requireSupabaseAuth):

- `setSamplePrepFlag({ sample_id, flag })` — toggles `prep_flag` on samples, writes audit row.
- `listPrepFlaggedSamples()` — returns samples with `prep_flag = true`, joined to CoC client/project, ordered oldest-first.
- `createRunList({...})` / `updateRunList` / `deleteRunList` / `getRunList` / `listRunLists`.
- `addSamplesToRunList({ run_list_id, sample_ids[] })` — appends in given order, assigns sequential `row_no` and `vial` starting from list's `starting_vial`.
- `reorderRunListItems` / `removeRunListItem` / `updateRunListItem`.
- `generateRunListCsv({ run_list_id })` — pulls items + list + active `run_list_columns` and returns `{ filename, csv }`. Resolves each column by source:
  - `literal` → `default_value`
  - `sample_field` → `samples.<sample_field>` (whitelisted)
  - `method` → item override else list method
  - `vial` → item vial
  - `data_file_pattern` → render `data_file_pattern` substituting `{sample}`, `{seq}`, `{yyyyMMdd}`, `{vial}`
  Properly RFC-4180 quotes fields containing commas/quotes/newlines. Sets `status='exported'`, stamps `exported_at/by`, uploads CSV to `openlab-cds` storage at `exports/<run_list_id>.csv` and stores path.
- `markRunListSent({ run_list_id })` — manual ack after analyst drops the CSV.

`src/lib/run-list-columns.functions.ts`:

- `listRunListColumns()` / `upsertRunListColumn` / `deleteRunListColumn` / `reorderRunListColumns` — admin-only writes.

Future hook (not built now, but designed for): `src/routes/api/public/run-list-agent.ts` POST endpoint authenticated by an HMAC secret that on-prem agent polls or that we push to. Mentioned as a TODO comment, not implemented this round.

## 3. UI

### Samples table
- Add a "Prep" toggle column (checkbox) to `samples-table.tsx`; clicking calls `setSamplePrepFlag`. Add a filter chip "Prep flagged" to `filters-card.tsx`.

### New section: Run List Builder
Sidebar entry **Run Lists** (icon `ListChecks`) → `/run-lists` with:
- List of saved/exported run lists, "New Run List" button.
- New/edit page `/run-lists/$id` shows:
  - Header card: name, instrument (select from `instruments`), method (combobox from `openlab_methods`), starting vial, inj/vial, data file pattern, notes.
  - "Add prep-flagged samples" panel: searchable picker of `listPrepFlaggedSamples` with multi-select + "Add selected".
  - Items table with reorderable rows (up/down buttons), per-row Sample Type / Method override / Vial / Comment, Remove.
  - Footer: "Preview CSV" (modal, monospace), "Download CSV" (calls `generateRunListCsv`, triggers browser download via blob), "Mark exported", "Save".
- Generated CSV header set = active `run_list_columns` in sort order.

### Admin
New admin page `/admin/run-list-columns` to manage the column list. Linked from `/admin/index.tsx`.

## 4. Out of scope this round

- On-prem agent (delivery option 2) — only schema/UI hooks added; no agent code or POST endpoint yet.
- ChemStation Edition variant — single column-set today, admin can edit it.
- Auto-status transition of the source `samples.status` on export (leave as-is until user asks).

## Technical notes

Files added: `supabase/migrations/<ts>_run_lists.sql`, `src/lib/run-lists.functions.ts`, `src/lib/run-list-columns.functions.ts`, `src/routes/_authenticated/run-lists/index.tsx`, `src/routes/_authenticated/run-lists/$id.tsx`, `src/routes/_authenticated/admin/run-list-columns.tsx`, `src/components/run-lists/*` (`run-list-form.tsx`, `prep-samples-picker.tsx`, `run-list-items-table.tsx`, `csv-preview-dialog.tsx`).

Files edited: `src/components/samples/samples-table.tsx`, `src/components/samples/filters-card.tsx`, `src/components/lims/sidebar-nav.tsx` (add Run Lists entry, icon `ListChecks`), `src/routes/_authenticated/admin/index.tsx`, `src/lib/query-keys.ts`.

CSV is generated server-side so the same exact bytes can later be POSTed to the on-prem agent without re-deriving them in the browser.
