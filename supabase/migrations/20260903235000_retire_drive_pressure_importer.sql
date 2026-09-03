-- Retire the hourly Drive .dx pressure importer.
--
-- The Daily Backpressure log is now written by the live instrument feed
-- (src/lib/instrument-feed.server.ts, rows with source = 'live'), verified
-- against a real sequence on 2026-09-03. Left running, the importer would log
-- every sequence a second time from the OpenLab result files on Drive. Stop
-- the pg_cron job and drop its trigger; the importer's code is archived under
-- archive/drive-pressure-importer/ with restore notes. Existing rows with
-- source = 'auto' (and their drive_result_folder_id / drive_dx_file_id) stay.
select cron.unschedule('pressure-log-watcher-hourly')
  where exists (select 1 from cron.job where jobname = 'pressure-log-watcher-hourly');
drop function if exists public.trigger_pressure_log_watcher();
