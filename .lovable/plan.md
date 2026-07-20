## Short answer

No — we never finished the external status feed. Today `/api/public/exports/:batchId` is the only partner-facing endpoint, and it only returns a payload once a sample is `approved`. For anything earlier (received, intake_verified, prep, in_progress, reviewed, complete) it just returns a `409` with the raw status name. There is no dedicated "where is my sample" endpoint your client portal can poll, and no per-stage timestamps exposed.

## Plan: Partner-facing Status API

Add a new authenticated public endpoint the client portal can hit to show live progress per sample, plus an optional bulk feed.

### Endpoints (all under `/api/public/`, HMAC/API-key protected the same way exports are)

1. `GET /api/public/status/:batchId`
   Returns one sample's current stage + history:
   ```json
   {
     "batch_id": "SYX-000123-01",
     "client": "...",
     "project": "...",
     "received_at": "...",
     "due_date": "...",
     "stage": "in_progress",
     "stage_label": "In Progress",
     "stage_percent": 55,
     "history": [
       { "stage": "received",         "at": "2026-07-10T14:02:00Z" },
       { "stage": "intake_verified",  "at": "2026-07-10T15:20:00Z" },
       { "stage": "prep",             "at": "2026-07-11T09:00:00Z" },
       { "stage": "in_progress",      "at": "2026-07-11T13:44:00Z" }
     ],
     "approved": false,
     "results_available": false
   }
   ```
   History is derived from `audit_log` rows where `action` starts with `status_change:` for that sample.

2. `GET /api/public/status?client=<name>&since=<iso>`
   Bulk feed for the client portal — same shape, array of samples for one client, filterable by `updated_since`. Paginated with `limit` (max 200) + `cursor`.

3. (Optional, phase 2) Outbound webhook on stage change so the portal doesn't have to poll — reuses the existing `partner_webhook_secrets` HMAC scheme, fired from a trigger on `samples.status` update.

### Auth & security

- Reuse the `export_config.api_key` header (`x-api-key`) that `/exports/:batchId` already uses, so partners only manage one key.
- Enforce `is_active` on `export_config`.
- Never return notes, analyst identities, peaks, or purity from the status endpoints — just stage, timestamps, and identifiers. Results stay behind the existing approved-only exports endpoint.

### Stage → label/percent mapping

Reuse `STATUS_LABEL` from `src/lib/lims-utils.ts` for labels and add a shared `STATUS_PERCENT` map (received 5, intake_verified 15, prep 30, in_progress 55, reviewed 75, complete 90, approved 100) so the portal can render a progress bar without knowing our internal enum.

### Files to add / touch

- `src/routes/api/public/status/$batchId.ts` — single-sample handler.
- `src/routes/api/public/status/index.ts` — bulk handler with `client` + `since` + pagination.
- `src/lib/lims-utils.ts` — add `STATUS_PERCENT` next to `STATUS_LABEL`.
- `docs/partner-webhook.md` — extend with a "Status API" section (endpoints, auth header, example responses, stage list).
- No schema changes required for v1 — history comes from existing `audit_log` rows written by `updateSampleStatus`.

### Out of scope for this pass

- Outbound stage-change webhook (listed as phase 2 above; say the word and I'll add it).
- A partner-scoped API key per client (today it's one shared key from `export_config`); we can layer that on later if you want per-partner revocation.

Want me to build all three endpoints, or start with just `GET /api/public/status/:batchId` and the docs update?