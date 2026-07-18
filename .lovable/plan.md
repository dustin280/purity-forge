# Port from Q-DAX (Remix) → Lab Manager

Fork accessible: [Remix of Lab Manager Soup Kitchen](/projects/d0adbd04-e723-4bdd-8f26-87322a4a0b70). Below is everything that changed on the fork in the last 10 days (Jul 8–18, 2026), grouped so you can pick what to port. Per your rules, **logo/branding (SYN→DAX rename, color palette, logo assets)** and **API/integration settings (secrets, export_config x-api-key, webhook secret table)** are excluded from all groups.

## Group A — Bug fixes (low risk, recommend porting all)

1. **Sample ID auto-generation on Sample Receipt** — `src/components/chain-of-custody/use-coc-form.ts`. Removes the "field must be configured" gate on `nextInvoice()` and adds a just-in-time fallback in the save mutation. Fixes the "Sample ID required" toast when the field isn't in active fields.
2. **Purity % input persistence** — `step-source.tsx` in standard-prep. Fixes uncontrolled input dropping digits (typing `100` displayed as `1%`). Only relevant if you also port Group C.

## Group B — Auth UX

3. **PasswordInput with show/hide eye toggle** — new `src/components/ui/password-input.tsx`, applied to all three password inputs (login, reset, admin create-user).
4. **Forgot Password flow** — link on `/login`, new `src/routes/reset-password.tsx` handling `PASSWORD_RECOVERY`/`SIGNED_IN` events. Uses request origin as redirect (no new secret needed).

## Group C — New Standard Prep flow (large feature)

5. **Type picker** at `/lab-logs/standard-preparations/new`: "Primary Standard: Solid" / "Primary Standard: Aqueous" / "Working Standard", each with its own guided wizard.
6. **Guided Solid flow**: Source step (pulls Lot# from Material Receipts or spawns a Material Receipt modal inline), diluent composition (percent-per-solvent, must sum to 100), modifier picker (TFA/FA/Add New) at trace percentages, prep parameters, generated instructions with **balance-reading grams** (0.0000 g) alongside mg.
7. **Auto internal lot ID** — new `stdlog_counters` table + `next_stdlog_lot()` function emitting `STDLOG_YYYYMMDD_N` (resets per date). Used as the label on instruction step 6 and as the controlled Material Receipt's internal lot.
8. **DB schema additions** on `standard_preparation_logs` (new columns for source/diluent/modifier) and a second FK to `material_receipts` (with disambiguated relationship name so PostgREST embeds work).
   - Naming note: fork ships `DAX_MMDDYY_...` prefixes; when porting we'd keep the existing `SYN_...` / whatever this project uses today so branding isn't touched.

## Group D — Analysis Queue system (large feature)

9. **`queue_config` table** (daily_capacity, tat_days, business_days_only, approaching_threshold_pct) + admin page at `/admin/queue-config` + admin tile.
10. **`samples` extensions**: `due_date`, `assigned_analysis_date`, `priority`, `actual_completion_date`; expanded `sample_status` enum (`scheduled`, `in_analysis`, `on_hold`, `cancelled`); trigger `set_sample_due_date` auto-computes due date from receipt_date + tat_days.
11. **Scheduler**: `src/lib/queue/scheduler.server.ts` (pure EDF simulation) + `src/lib/queue.functions.ts` (getQueueOverview, checkNewSampleCapacity, autoSchedulePending, reassignSample, setSampleQueueStatus, get/updateQueueConfig).
12. **UI**: sidebar entry "Analysis Queue"; route `/queue` with StatusBanner, CapacityOverview (7-day rolling), ScheduleByDay, AtRiskPanel, QuickActions, AutoScheduleDialog, CapacityCheckDialog (realtime).
13. **Optional intake capacity gate** — wire `checkNewSampleCapacity` into `useCocForm` submit as a blocking dialog. Off by default on the fork; you'd choose whether to enable.

## Group E — Security hardening

14. Fork applied a batch of Supabase findings (unauth AI chat endpoints, `SUPA_anon_security_definer_function_executable`, `SUPA_authenticated_security_definer_function_executable`, clients/pending_orders exposure). This project has already gone through its own security passes (Wiz + Supabase) — most of these overlap and are likely already fixed here. **Recommend: skip auto-port**, and instead re-run the security scan after Groups A–D land to catch any regressions.

## Explicitly excluded (per your instructions)

- SYN → DAX rebrand across UI, PDFs, and `next_syn_id` function
- DAX Research logo assets and color palette
- Any changes to secrets, `export_config.x-api-key`, or the `partner_webhook_secrets` table

## Recommendation

Port in this order to keep risk low and each step independently shippable:

1. **Group A** (2 tiny fixes) → merge immediately.
2. **Group B** (PasswordInput + Forgot Password) → self-contained.
3. **Group C** (Standard Prep flow) → largest churn in `standard-preparations/`; needs a migration.
4. **Group D** (Analysis Queue) → new module + `samples` migration; sidebar change.
5. Re-run security scan; skip Group E unless the scan surfaces something.

## Next step

Reply with the groups (or specific numbered items) you want ported and I'll switch to build mode and execute. If you want a rendered file-by-file diff for any group before deciding, say which group.
