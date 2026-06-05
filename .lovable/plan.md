## Problem

The "Test" button for the Sequences folder reports "No Drive Sequences folder configured" even though the ID is typed into the input. `testDriveFolder` reads the folder ID from the database (`openlab_settings`), so it only works after clicking **Save Drive folders**. If the user tests before saving (the natural flow), it always fails.

## Fix

Make Test use the value currently in the input, not the DB.

### `src/lib/openlab-drive.functions.ts`
- Change `testDriveFolder` input to `{ kind, folder_id? }`. If `folder_id` is provided, list that folder directly; otherwise fall back to the saved setting (preserves any other callers).
- Validate `folder_id` with the same regex used in `driveSettingsSchema`.

### `src/components/instrument-comm/settings-card.tsx`
- Update `testFolder(kind)` to pass the current input value: `testDrive({ data: { kind, folder_id: kind === "Methods" ? methodsFolderId : sequencesFolderId } })`.

No DB changes, no UI restructure. Admin-only gating on the server function is unchanged.
