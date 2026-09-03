# Archived: Drive `.dx` pressure importer (retired 2026-09-03)

Until 2026-09-03 the Daily Backpressure log was filled automatically by an
hourly job that scanned the OpenLab "Results" folder on Google Drive, unzipped
the first injection's `.dx` file of every new `.rslt` result folder, and wrote
one `daily_backpressure_logs` row per sequence (`source = 'auto'`, user
"Automated Watcher") with the mean pressure / flow / column temperature over
the first 15 s of the run plus the run's pressure min/max.

It was replaced by the live instrument feed (`docs/instrument-live-feed.md`):
the on-prem agent taps the instrument LAN and writes the same row, with the
same definitions, the moment each sequence's first injection completes
(`source = 'live'`). Running both would log every sequence twice, so the
importer was stopped once a live row had been checked against a real run.

## What is in here

| File | Was |
|---|---|
| `pressure-watcher.functions.ts` | `src/lib/lab-logs/pressure-watcher.functions.ts` — the scan/import logic (`runPressureWatcher`) and the admin-only *Run watcher now* server function |
| `cron-route.pressure-log.ts` | `src/routes/api/cron/pressure-log.ts` — the `POST /api/cron/pressure-log` endpoint pg_cron called, authenticated by `sp_settings.cron_secret` |

Not archived, still in use by other features (Cal/QC peak log, `.dx` pickers):
`src/lib/lab-logs/drive-results.functions.ts` (Drive listing/download) and
`src/lib/lab-logs/agilent-trace.ts` (`.dx` manifest and `.IT` trace parser).

Database: migration `20260903235000_retire_drive_pressure_importer.sql`
unscheduled pg_cron job `pressure-log-watcher-hourly` and dropped
`public.trigger_pressure_log_watcher()`. Existing `source = 'auto'` rows and the
`drive_result_folder_id` / `drive_dx_file_id` columns were left in place.

## Restoring it

1. Move the two files back to their original paths (fix the relative imports
   in `pressure-watcher.functions.ts`: `./drive-results.functions`,
   `./agilent-trace`).
2. Re-create the trigger function and cron job — the last definition is in
   `supabase/migrations/20260830160000_cron_http_timeouts.sql` (function) and
   `supabase/migrations/20260814143755_1d3d3851-289f-428c-979c-0591521eb56d.sql`
   (`cron.schedule('pressure-log-watcher-hourly', '0 * * * *', ...)`).
3. Put the *Run watcher now* button back on
   `src/routes/_authenticated/lab-logs/daily-backpressure/index.tsx`
   (see git history before commit "Retire the Drive pressure importer").
4. Stop the live feed from writing Daily Backpressure rows, or you will get
   two rows per sequence again.

This folder is outside `tsconfig.json`'s `include` and is ignored by ESLint, so
nothing here is compiled or linted.
