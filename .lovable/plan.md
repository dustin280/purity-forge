## Goal
Add an "Audit Trail" entry point on the Admin page so admins can browse the `audit_log` table (table changes with old/new diff, actor, timestamp).

## Changes

**1. `src/routes/_authenticated/admin/index.tsx`**
Add a new tile to the `TILES` array:
- Title: "Audit Trail"
- Description: "Review all database changes — who changed what, when, with before/after diffs."
- Icon: `History` (lucide-react)
- Link: `/admin/audit-log`

**2. `src/routes/_authenticated/admin/audit-log.tsx`** (new)
Admin-only route patterned after `access-logs.tsx`:
- Date range filter (default last 30 days) + optional table-name filter + free-text search on actor.
- Query `audit_log` joined with `profiles` (for actor name/email) ordered by `changed_at desc`, limit 1000.
- Table columns: Timestamp, Table, Action (INSERT/UPDATE/DELETE pill), Record ID, Changed By, "View diff" button.
- "View diff" opens a Dialog showing pretty-printed JSON of `diff` (for UPDATE: side-by-side old vs new; for INSERT/DELETE: single JSON block).
- Gate UI with `role === "admin"` (RLS already restricts non-admins from meaningful reads — actually current RLS is `true` for authenticated, but we'll still gate the UI to admin to match the rest of admin section).

## Notes
- No DB or backend changes required — `audit_log` table and RLS already exist.
- No PDF export in v1 (can add later if needed).
