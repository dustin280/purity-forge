-- The original migration only granted SELECT to authenticated and had no
-- write policy, so applyOneMatch's upsert() into report_reconciliation_failures
-- silently failed (Supabase JS doesn't throw on RLS/grant denial by
-- default, and the calling code doesn't check the upsert's error) whenever
-- it ran under a real user session — the admin "Run now" button and the
-- manual per-row "Apply" action. Only the hourly cron (which uses the
-- service-role client, bypassing RLS entirely) was actually recording
-- failures and getting the one-attempt cap. Confirmed live: two
-- consecutive "Run now" clicks re-downloaded and re-parsed the same 9
-- known-bad files with identical fresh error text instead of skipping
-- them on the second pass.
GRANT INSERT, UPDATE ON public.report_reconciliation_failures TO authenticated;
CREATE POLICY "auth insert report reconciliation failures" ON public.report_reconciliation_failures
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update report reconciliation failures" ON public.report_reconciliation_failures
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
