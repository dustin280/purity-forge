
# Instrument Communication — Phase 1 (Read-only OpenLab CDS browser)

A new top-level section that lets a chemist browse Acquisition Methods and Sequences from an Agilent OpenLab CDS project folder exposed over a shared network path, plus a settings panel for the connection.

## Architecture decision

The browser sandbox cannot reach a local lab PC or SMB share directly, and the Cloudflare Worker that runs server functions cannot mount a Windows network drive either. Phase 1 therefore uses a **server-side "project folder" abstraction** backed by Supabase Storage:

- An admin uploads/syncs the OpenLab CDS project folder contents (or just the `Methods/` and `Sequences/` subfolders) into a new private Storage bucket `openlab-cds`.
- A small **sync helper** (documented for the user; out of scope to build the Windows-side script in this phase) copies `.M` method folders and `.S` sequence files from the lab PC into that bucket. We provide a CSV import path as the primary on-ramp because OpenLab CDS natively exports sequences as CSV.
- Server functions read from the bucket and parse metadata. The UI shows "Connected" when the configured path resolves and at least one method or sequence is found; otherwise "Disconnected" with guidance.

This keeps Phase 1 fully working today and leaves a clean seam for Phase 2 (a local agent that pushes files, or a future direct OpenLab Web API integration).

## Database

New migration:

- `openlab_settings` (singleton, admin-only write)
  - `project_folder_path text` — display label, e.g. `\\LAB-PC-01\OpenLabData\Projects\HPLC-DAD`
  - `storage_prefix text` — bucket sub-path the server reads from, default `default/`
  - `last_synced_at timestamptz`
  - `notes text`
- `openlab_methods` — cached index of discovered methods
  - `name text` (PK with prefix), `description text`, `relative_path text`, `last_modified timestamptz`, `size_bytes bigint`, `synced_at timestamptz`
- `openlab_sequences` — cached index of discovered sequences
  - `name text`, `status text` (Idle/Ready/Unknown), `relative_path text`, `last_modified timestamptz`, `line_count int`, `synced_at timestamptz`
- Storage bucket `openlab-cds` (private). RLS:
  - Read: any authenticated user
  - Write: admin only (and service role via server)

RLS on both tables: `select` for all authenticated; `insert/update/delete` admin only.

## Server functions (`src/lib/openlab.functions.ts`)

- `getOpenLabSettings()` — returns settings + connection status (`connected | disconnected | not_configured`).
- `updateOpenLabSettings({ project_folder_path, storage_prefix, notes })` — admin only.
- `listOpenLabMethods()` — returns cached `openlab_methods` rows.
- `listOpenLabSequences()` — returns cached `openlab_sequences` rows.
- `getOpenLabMethod({ name })` — returns metadata + first ~200 lines of the method descriptor text file if present.
- `getOpenLabSequence({ name })` — returns metadata + parsed CSV lines (vial, method, sample name, injection volume, etc.).
- `syncOpenLabIndex()` — admin only. Lists files under `openlab-cds/<storage_prefix>/Methods/*.M/` and `Sequences/*.{S,csv}`, parses lightweight metadata, upserts into the two cache tables, stamps `last_synced_at`.
- `importSequenceCsv({ name, csvText })` — admin/tech. Validates CSV (OpenLab native sequence export format), uploads to Storage, refreshes the sequence row.

All use `requireSupabaseAuth`; admin-gated ones additionally check `has_role(uid, 'admin')`.

## Routes & UI

```
src/routes/_authenticated/instrument-comm/
  index.tsx                 -> overview + connection card + tiles
  openlab/index.tsx         -> tabs: Methods | Sequences | Settings
  openlab/methods.$name.tsx -> method detail drawer/page
  openlab/sequences.$name.tsx -> sequence detail page (table of lines)
```

Sidebar: add "Instrument Comm" entry (icon `Network` or `Cable`) under Operations, just above `Scheduler`.

Components (`src/components/instrument-comm/`):

- `connection-status-card.tsx` — green/red dot, configured path, last sync time, "Sync now" button (admin).
- `methods-table.tsx` — name, description, last modified, size; click → detail.
- `sequences-table.tsx` — name, status pill, lines, last modified; click → detail.
- `method-detail.tsx` — metadata + preview of method text.
- `sequence-detail.tsx` — table of sequence lines parsed from CSV.
- `settings-card.tsx` — admin-only form for `project_folder_path`, `storage_prefix`, notes; CSV import dropzone.
- `use-openlab.ts` — react-query hooks wrapping the server functions.

Reuse existing `Table`, `Card`, `Dialog`, `Badge`, `Button`, `StatusPill` to match the lab aesthetic. Honor the existing responsive rules: page padding `p-4 sm:p-6 lg:p-8`, heading `text-2xl sm:text-3xl`, tables already scroll horizontally.

## What the user will need to configure after build

1. Open **Instrument Comm → OpenLab CDS → Settings** (admin) and set the display path to the OpenLab project folder on the lab PC.
2. Upload an initial snapshot of the `Methods/` and `Sequences/` folders (or paste CSV sequence exports) via the Settings panel. A short README in the panel explains the suggested Windows `robocopy` one-liner / scheduled task for keeping the snapshot fresh — building that Windows-side agent is Phase 2.
3. Click **Sync now** to populate the methods/sequences index.
4. Verify the connection card flips to **Connected**.

## Out of scope (Phase 2+)

- Writing methods/sequences back to the instrument.
- Live OpenLab CDS run control / queue submission.
- Direct SMB or REST connection to the lab PC (requires an on-prem agent or OpenLab Web API license).

## Verification

- Migration applies cleanly; RLS denies non-admin writes.
- With empty storage: status = "Not configured / Disconnected", tables show empty state with guidance.
- After uploading a sample `.M` folder and a sample sequence CSV and clicking Sync: both tables populate, detail pages render, status flips to Connected.
- Desktop layout unchanged at ≥1024px; mobile stacks correctly.
