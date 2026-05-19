# LIMS Build Plan — Agilent 1290 DAD Peptide Purity

## Design
Use the **v1 "Precision Analytical Suite"** direction (dark sidebar + light content, IBM Plex Mono for numerics, Inter for UI), with the content background darkened from `slate-50` to a **muted warm slate** (`#eef0f3` panels on a `#e5e7ec` page background). Sidebar stays dark slate; cards stay white for contrast on tables and chromatograms.

## Backend (Lovable Cloud)
Enable Cloud, then provision:

**Schema**
- `profiles` (id ↔ auth.users, full_name, email)
- `app_role` enum: `admin | tech | reviewer`
- `user_roles` (user_id, role) + `has_role()` security-definer function
- `samples` (batch_id unique, client, project, receipt_date, status enum `received|in_progress|reviewed|approved`, notes, created_by, timestamps)
- `tests` (sample_id, method_name, instrument default `'Agilent 1290 DAD'`, parameters jsonb, assigned_tech, status)
- `results` (test_id, purity_percentage, peak_details jsonb [{peak_id, rt, area, area_pct, identity, sn}], raw_data_file_path, analysis_date, analyst_id, reviewer_id)
- `audit_log` (table_name, record_id, action, changed_by, diff jsonb, changed_at) — populated by trigger on samples/tests/results
- `export_config` (singleton: webhook_url, api_key_hash, include_lcs, include_ccv, include_method_blank, include_calibration)
- `export_deliveries` (sample_id, payload jsonb, status, attempts, last_error, delivered_at)

**Storage**
- `raw-data` bucket (private) for Agilent `.D` exports / chromatogram images, RLS: tech/admin write, reviewer/admin read.

**RLS**
- Admin: full access. Tech: read all, write own samples/tests/results. Reviewer: read all, update status to `reviewed/approved` only. All policies via `has_role()`.

## Auth
Email/password + Google (via Lovable broker + `configure_social_auth`). First registered user auto-granted `admin`; admins assign roles from a Users page.

## Pages (TanStack routes)
- `/login`, `/reset-password` — public
- `/_authenticated/` layout — session gate
  - `/` Dashboard — KPI tiles (received today, in progress, awaiting review, avg purity, LCS recovery), recent samples table, audit stream sidebar
  - `/samples` — filterable table
  - `/samples/new` — intake form + dropzone (uploads to `raw-data`)
  - `/samples/$batchId` — tabs: Info · Tests · Results · COA · Audit. Chromatogram render + peak table + Approve/Reject (reviewer only)
  - `/samples/$batchId/results/new` — results entry (purity, peak rows)
  - `/integrations` — webhook URL, API key, extras toggles (LCS, CCV, Method Blank, Calibration), test ping
  - `/users` (admin) — role management

## COA + Export Hook
- COA PDF via `jspdf` + `jspdf-autotable`: letterhead placeholder, sample/method/instrument block, purity summary, peak table, analyst + reviewer signature blocks with timestamps.
- **Public ingestion endpoint** for the external COA system: `src/routes/api/public/exports/$batchId.ts` (GET, bearer-key auth against `export_config.api_key_hash`). Returns JSON `{ sample, test, result, peaks, signatures, extras: { lcs_recovery?, ccv_recovery?, method_blank_spectra?, calibration_data? } }` — extras conditionally included per toggles.
- On sample `approved`, server fn enqueues a delivery row; a fire-and-forget `fetch` POSTs to `export_config.webhook_url` with the same payload + HMAC signature header. Retries tracked in `export_deliveries`.

## Audit
DB trigger writes `INSERT/UPDATE/DELETE` diffs to `audit_log`. UI surfaces per-sample audit tab + global stream on dashboard.

## Tech notes
- All Supabase writes via `createServerFn` with `requireSupabaseAuth`; public export route uses `supabaseAdmin` after bearer verification.
- Mobile-responsive: sidebar collapses to top nav < md.
- Start with seeded mock samples (3–5) so the dashboard isn't empty on first load.

## Out of scope (call out)
- Parsing native Agilent `.D` binary files — we store the upload as-is; peak data is entered/pasted by the tech.
- e-signature compliance (21 CFR Part 11) beyond timestamped reviewer approval.
