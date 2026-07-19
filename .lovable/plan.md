## Goal

Make the Run List Generator export a CSV that matches the Agilent OpenLab sequence table format exactly, and drop that CSV into the instrument's Google Drive folder (starting with `1hfGG9mNoT7imy3J9LT_OLneFOK4jLtTN`) with one click — no manual download-then-upload.

## 1. Update the CSV format to match Agilent

Rewrite `sequenceToCsv` in `src/lib/run-lists/generate.functions.ts` so the header row and column order match the uploaded spec exactly:

```
Sample name, Sample type, Vial, Volume, Acq Method, Proc Method, Data file, Description, Level
```

Row mapping:
- **Sample name** → `r.label`
- **Sample type** → map `NIB / ICB / CCB` → `Blank`, `ICV / CCV` → `Cal. Std.` (currently we emit `Standard`), samples → `Sample`
- **Vial** → `r.vial` (tray code like `D1F-A1`, or `Ref 1..5` for blanks — already what the optimizer produces)
- **Volume** → the injection volume input (unitless number, per spec)
- **Acq Method / Proc Method** → full Windows paths built as `<instrument.default_method_folder>\<method>.amx` / `.pmx` when the stored method is a bare name; pass through unchanged when it already looks like a full path
- **Data file** → leave blank so OpenLab auto-generates (spec calls this Optional and notes OpenLab can auto-generate); today we synthesize a name, which becomes noise on-instrument
- **Description** → `"<Method Group name> - <Seq name>"` when known, else blank
- **Level** → blank for everything except calibration standard rows (we don't currently carry a level, so this stays empty unless we later track it)

Keep the UTF-8 BOM prefix and `\r\n` line endings so Excel/OpenLab both open it cleanly.

## 2. Per-instrument Drive folder

Add an optional `drive_folder_id` column to `inventory_items` via migration (nullable text). Surface it on the Instruments inventory edit form as **Google Drive Sequences folder ID / URL** with the same URL-to-ID normalization `openlab-drive.functions.ts` already uses (`extractFolderId`) so users can paste the whole `https://drive.google.com/drive/folders/...` link.

Seed the folder ID `1hfGG9mNoT7imy3J9LT_OLneFOK4jLtTN` on the instrument the user is currently working with by prefilling it in the UI on first save — no auto-write to any specific instrument in migration (we don't know which row it belongs to).

## 3. "Push to Drive" from the generator

In `src/lib/run-lists/generate.functions.ts`, add a new server fn `pushGeneratedRunListToDrive` that:
1. Rebuilds the CSV the same way `generateAndSaveRunList` does (share the builder).
2. Resolves the target folder ID in this order: instrument's `drive_folder_id` → `openlab_settings.drive_sequences_folder_id` → error asking the user to set one.
3. Uses the same Drive multipart upload / update-by-name helpers already in `openlab-drive.functions.ts` (extract them into `openlab-drive.server.ts` if needed to avoid a circular import) so an existing file with the same name is versioned instead of duplicated.
4. Records the push in the existing `openlab_drive_pushes` table.

In `src/routes/_authenticated/run-lists/generate.tsx`:
- Add a **Push to Drive** button next to **Generate Sequence CSV** on each visible sequence card, plus a **Push selected to Drive** action alongside the existing bulk download.
- Toast the resulting Drive file name on success.

## 4. Verification

- Run the built-in Drive test flow (`testDriveFolder`) against the pasted folder ID to confirm the service account can list/write.
- Generate a sequence for one instrument, click **Push to Drive**, and check the file appears in the target folder with the Agilent-format header row.

## Out of scope

- Auto-populating `Level` for calibration standards (we don't track level yet).
- Changing the optimizer or how methods are stored.
- Scheduled/automatic pushes — this stays user-initiated.
