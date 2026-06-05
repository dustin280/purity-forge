## Goal

Treat Drive "Reports" as a first-class kind next to Methods and Sequences in the OpenLab CDS module: configurable Drive folder, Pull/Test, indexed in the database, and browsable as its own tab.

## Changes

### 1. Database (new migration)

- `openlab_settings`: add `drive_reports_folder_id text` and `drive_last_pulled_reports_at` is not needed — reuse the existing `drive_last_pulled_at`.
- New table `public.openlab_reports` mirroring `openlab_sequences` shape:
  - `id uuid pk`, `name text not null`, `relative_path text`, `last_modified timestamptz`, `size_bytes bigint`, `synced_at timestamptz`, `created_at timestamptz default now()`.
  - Grants: `authenticated` select/insert/update/delete, `service_role` all.
  - RLS enabled with the same policies used for `openlab_sequences` (auth-only read; admin write — match exactly what's there today).

### 2. Server functions (`src/lib/openlab-drive.functions.ts`)

- Extend `Kind` to `"Methods" | "Sequences" | "Reports"`.
- `syncKind`: when `kind === "Reports"`, wipe + reinsert into `openlab_reports`. Folder entries indexed as a single row (same `.M`/`.S` folder pattern, no `line_count`); flat files downloaded into the bucket under `${prefix}Reports/`.
- `driveSettingsSchema` + `updateDriveSettings`: accept and persist `drive_reports_folder_id`.
- `pullDriveSnapshot`: accept optional `reports_folder_id`, fall back to settings, return `{ methods, sequences, reports }`.
- `testDriveFolder`: extend `kind` enum to include `"Reports"`.

### 3. Settings UI (`src/components/instrument-comm/settings-card.tsx`)

- Add `reportsFolderId` state, hydrate from settings.
- Add a third "Reports folder ID" input + Test button in the Drive grid (grid becomes `sm:grid-cols-3` or stacks gracefully).
- `saveDrive` / `pullMut` pass the new ID. Toast becomes `"Pulled X methods, Y sequences, Z reports from Drive"`.
- Upload-kind toggle in the upload block: add `"Reports"` as a third option.

### 4. Reports tab (`src/routes/_authenticated/instrument-comm/openlab.tsx`)

- Add a `<TabsTrigger value="reports">Reports</TabsTrigger>` and matching `TabsContent` rendering a new `ReportsTable` component.

### 5. ReportsTable (`src/components/instrument-comm/reports-table.tsx`)

- Mirror `sequences-table.tsx` but read from `openlab_reports`. Columns: name, relative path, last modified, size, synced at. No `line_count`/`status`.

### 6. Hook (`src/components/instrument-comm/use-openlab.ts`)

- Add a `useOpenLabReports` query similar to `useOpenLabSequences`.

## Out of scope

- No changes to push (run-lists are still pushed only to the Sequences folder).
- No changes to the run-list/sample workflow.
