## Fix Pull silently returning 0

`pullDriveSnapshot` reads folder IDs from the DB. If Save Drive folders hasn't been clicked, the DB is empty and Pull returns `{methods: 0, sequences: 0}` with no error.

### Changes

**`src/lib/openlab-drive.functions.ts`**
- Add optional `methods_folder_id` / `sequences_folder_id` inputs to `pullDriveSnapshot`, preprocessed with `extractFolderId` (so a pasted URL is accepted).
- Use provided IDs when present, otherwise fall back to saved settings.
- If both effective IDs are empty, throw "No Drive folders configured" instead of returning silently.

**`src/components/instrument-comm/settings-card.tsx`**
- Pull button: first calls `updateDriveSettings` with the current input values to persist them, then calls `pullDriveSnapshot` with the same IDs as a fallback. Single click, no separate Save required.
- Keep the standalone Save Drive folders button.
