
## Goal

Add an admin-only page at **Admin → Partner Webhook Secret** where admins can see the current secret's status and rotate it without a redeploy, and have the intake webhook accept the rotated value immediately.

## Why not just show the current value

Secrets should never be readable after they're set — not by the UI, not by other admins, not from logs. The platform's secret store (`PARTNER_WEBHOOK_SECRET` env var) is write-only for the same reason. So the UI shows **status and metadata**, not the value, and rotation reveals the new value **exactly once** (at generation time) so the admin can copy it into the partner's system.

## Behavior

**Partner Webhook Secret page** (`/admin/partner-webhook-secret`, admins only):

- Status card showing:
  - Whether a secret is currently active (green/red badge)
  - Fingerprint (first 6 + last 4 chars of a SHA-256 hash) so admins can confirm which secret is live without exposing it
  - When it was created / last rotated, and by whom
  - Last time it successfully verified a webhook request (populated by intake.ts on success)
- **Rotate secret** button:
  - Generates a new 64-char random secret server-side
  - Shows the new value in a one-time reveal panel with a Copy button and a warning that it won't be shown again
  - Marks the previous secret as deprecated but keeps it valid for a **48-hour grace window** so the partner has time to swap in the new value without dropped webhooks
- **Revoke previous secret now** button (only visible while a deprecated secret exists) to end the grace window early
- Link to `docs/partner-webhook.md` and the intake URL for reference

**Intake endpoint** (`src/routes/api/public/orders/intake.ts`):

- Accept a request if the HMAC matches EITHER the current DB secret OR any deprecated-but-still-in-grace DB secret OR the legacy `PARTNER_WEBHOOK_SECRET` env var (kept as fallback so nothing breaks on rollout / if DB secret is ever cleared)
- On successful verification, update `last_verified_at` on the matching row

**Sidebar / admin nav:** add "Partner Webhook Secret" under the existing Admin group.

## Data model

New table `partner_webhook_secrets` (admins-only via RLS + `has_role('admin')`):

```text
id               uuid PK
secret_hash      text     -- sha256(secret) for verification; original never stored
secret_preview   text     -- fingerprint for UI (first6…last4 of hash)
status           text     -- 'active' | 'deprecated' | 'revoked'
created_at       timestamptz
created_by       uuid  -> auth.users
deprecated_at    timestamptz
grace_until      timestamptz
last_verified_at timestamptz
```

Exactly one row may be `active` at a time (partial unique index). Rotation flips the old active row to `deprecated` with `grace_until = now() + 48h` and inserts a new active row.

The **plaintext secret is never stored** — only its SHA-256 hash. Verification computes HMAC with the plaintext at request time, so we compare against candidate secrets… which means we need the plaintext during verification, which means the DB has to hold it. Correction: the table stores the plaintext in a `secret` column, protected by RLS (`admin` only) plus revoked from `anon`/`authenticated`. Access from the webhook goes through `supabaseAdmin` inside the handler; the value is never sent to the client. The UI only ever renders the fingerprint.

## Files

- Migration: create `public.partner_webhook_secrets` with grants, RLS (admin read/write via `has_role`), and partial unique index on `(status) where status = 'active'`.
- `src/lib/partner-webhook-secret.functions.ts`: `getSecretStatus`, `rotateSecret`, `revokeDeprecated` — all `.middleware([requireSupabaseAuth])` + admin-role check via `context.supabase.rpc('has_role', ...)`; write ops use `supabaseAdmin` (dynamic import inside handler).
- `src/routes/_authenticated/admin/partner-webhook-secret.tsx`: status card, rotate flow with one-time reveal dialog, revoke button.
- `src/routes/api/public/orders/intake.ts`: replace single env lookup with a helper that pulls active + in-grace DB secrets (via `supabaseAdmin`), falls back to env, tries each with timing-safe compare, updates `last_verified_at` on match.
- Add nav entry alongside existing `admin/*` links.

## Out of scope

- No changes to the payload schema, idempotency, or CoC seeding flow.
- No email / notification on rotation (can add later if wanted).
