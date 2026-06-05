## Goal

Let the lab PC share its OpenLab `Methods\` and `Sequences\` folders via Google Drive for desktop, and let LIMS pull snapshots from Drive into the `openlab-cds` bucket and push generated run-list CSVs back into the Sequences folder — so the CSV lands on the OpenLab PC automatically.

## Architecture

```text
OpenLab PC ──(Drive for desktop, two-way)── Google Drive ──(Lovable connector)── LIMS
   Methods\          ▲                       Methods folder ID
   Sequences\        │                       Sequences folder ID
                     │
            LIMS push: run-list CSV ──────────► Sequences folder ──► appears on PC
            LIMS pull: list + download ◄─────── both folders ──────► openlab-cds bucket ──► sync indexer
```

- Drive account: shared lab Google account, linked once via the **Google Drive standard connector** (workspace-scoped, no per-user OAuth).
- Folder layout: flat. Admin pastes a **Methods folder ID** and a **Sequences folder ID** into Settings; LIMS does not assume any subfolder structure inside Drive.
- File transport: Drive for desktop on the lab PC. No Windows agent, no SMB, no scheduled robocopy.

## Database

New columns on `openlab_settings` (singleton row):
- `drive_methods_folder_id text` (nullable)
- `drive_sequences_folder_id text` (nullable)
- `drive_last_pulled_at timestamptz` (nullable)
- `drive_last_pushed_at timestamptz` (nullable)

New table `openlab_drive_pushes` to audit run-list pushes:
- `run_list_id uuid` (FK to `run_lists`)
- `drive_file_id text`, `drive_file_name text`, `pushed_by uuid`, `pushed_at timestamptz`
- RLS: authenticated read, admin/reviewer write; service_role full.

## Server functions (`src/lib/openlab-drive.functions.ts`)

All admin-gated via `requireAdmin` helper already used in `openlab.functions.ts`.

- `listDriveFolder({ kind: "Methods" | "Sequences" })` — calls Drive v3 `files.list?q='<folderId>' in parents and trashed=false&fields=files(id,name,mimeType,modifiedTime,size,md5Checksum)` through the gateway. Returns the file listing for the chosen folder. Used by a preview UI.
- `pullDriveSnapshot()` — for each kind:
  1. List files in the configured folder ID.
  2. For each file, download via Drive `files/{id}?alt=media`, upload to `openlab-cds` at `<prefix><Kind>/<name>` with `upsert: true`.
  3. Delete bucket entries under `<prefix><Kind>/` that no longer exist in Drive (keeps the bucket in sync with Drive).
  4. Call the existing `syncOpenLabIndex` logic to rebuild the `openlab_methods` / `openlab_sequences` tables.
  5. Stamp `drive_last_pulled_at`.
- `pushRunListToDrive({ runListId })` — generate the OpenLab CSV (reuse existing `generateRunListCsv` from `run-lists.functions.ts`), upload it to the Sequences folder via Drive multipart upload (`POST /upload/drive/v3/files?uploadType=multipart` with `parents: [sequencesFolderId]`). If a file with the same name already exists in that folder, update it via `PATCH /upload/drive/v3/files/{id}?uploadType=media` instead of creating a duplicate. Insert an `openlab_drive_pushes` row and stamp `drive_last_pushed_at`.

All gateway calls use:
```
GATEWAY_URL = https://connector-gateway.lovable.dev/google_drive/drive/v3
Authorization: Bearer ${LOVABLE_API_KEY}
X-Connection-Api-Key: ${GOOGLE_DRIVE_API_KEY}
```
Upload endpoint base: `https://connector-gateway.lovable.dev/google_drive/upload/drive/v3`.

## Connector

Link the **Google Drive** standard connector to the project (one shared lab account). This provisions `GOOGLE_DRIVE_API_KEY` and ensures `LOVABLE_API_KEY` is present — both read from `process.env` inside the server functions.

## UI

**Settings card** (`src/components/instrument-comm/settings-card.tsx`): add a "Google Drive" section visible to admins:
- Two text inputs: Methods folder ID, Sequences folder ID (with helper text explaining how to copy the ID from a Drive folder URL).
- "Test connection" button — calls `listDriveFolder` for each kind and shows file counts + first 5 names.
- "Pull now" button — runs `pullDriveSnapshot`, shows toast with files pulled and last-pulled timestamp. Replaces the manual file uploader as the primary path (manual upload stays as fallback).

**Connection status card**: surface `drive_last_pulled_at` next to the existing `last_synced_at`.

**Run List detail page** (`src/routes/_authenticated/run-lists/$id.tsx`): add a "Send to OpenLab (Drive)" button next to the existing download/export buttons. Calls `pushRunListToDrive`, then toasts the Drive file name. Disabled if Sequences folder ID is not configured.

## What this does not change

- The existing `syncOpenLabIndex` and manual upload panel keep working — Drive is an additional, preferred path, not a replacement.
- No realtime HPLC status, no remote run start (OpenLab CDS still doesn't expose those without Agilent's Windows SDK).
- Drive for desktop must stay signed in on the lab PC; if it logs out, pulls silently return the last snapshot. The "Test connection" button is how an analyst confirms freshness.

## Setup instructions to surface in the Settings card

1. On the OpenLab PC, install Google Drive for desktop, sign in as the shared lab account, and mark the OpenLab project folder (or a mirror containing `Methods\` and `Sequences\`) as "Available offline / Mirror".
2. In Drive web, open the Methods folder, copy the ID from the URL (`drive.google.com/drive/folders/<ID>`), paste into Settings. Repeat for Sequences.
3. Click **Test connection** → expect non-zero counts. Click **Pull now**.
4. To send a run list to the instrument: open the run list → **Send to OpenLab (Drive)** → CSV appears in the PC's Sequences folder within seconds.
