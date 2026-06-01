## Timesheet System — Plan

Build a Timesheet feature wired into the existing app (auth, Lovable Cloud, TanStack Start), not a standalone HTML page. It will live under **Lab Logs › Timesheets** and follow the same patterns as Mobile Phase Prep Log and Standard Preparations.

Key deviations from the pasted spec (called out so you can approve/adjust):
- **Storage:** Use Lovable Cloud (Supabase) with RLS, not `localStorage`. This is the only way to share data across devices, survive cache clears, and respect the existing user system.
- **User system:** Use the existing `useAuth` hook + `requireSupabaseAuth` middleware. No `currentUser` global.
- **Start/End times:** Spec mentions Start/End in the CSV but Duration as the input. I'll make Start/End **optional** fields on each entry (date + optional start time + optional end time) and auto-fill duration if both are given. Duration remains the source of truth.

---

### 1. Database (one migration)

Table `public.timesheet_entries`:
- `id uuid pk`
- `user_id uuid not null` (no FK to `auth.users`)
- `entry_date date not null`
- `project text not null`
- `task_description text not null`
- `duration_hours numeric(6,2) not null check (duration_hours > 0 and duration_hours <= 24)`
- `start_time time null`
- `end_time time null`
- `notes text null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()` (trigger)

Indexes: `(user_id, entry_date desc)`, `(user_id, project)`.

GRANTs to `authenticated` + `service_role`, RLS enabled, four policies (select/insert/update/delete) all scoped to `auth.uid() = user_id`. Admins can read all via `has_role(auth.uid(),'admin')` on the select policy.

Optional small table `public.timesheet_projects` (admin-managed dropdown list: `id`, `name`, `active`) so the Project field is a dropdown with "Other → free text" fallback, mirroring the Mobile Phase reagents admin pattern.

### 2. Server functions (`src/lib/timesheets.functions.ts`)

All use `requireSupabaseAuth`:
- `listTimesheetEntries({ from?, to?, project?, q?, sortBy?, sortDir? })`
- `getTimesheetEntry({ id })`
- `createTimesheetEntry(input)`
- `updateTimesheetEntry({ id, ...patch })`
- `deleteTimesheetEntry({ id })`
- `getTimesheetSummary({ from, to })` → totals grouped by day, week, project
- `listTimesheetProjects()` / admin CRUD for projects

Zod validation on every input.

### 3. Routes (under `src/routes/_authenticated/lab-logs/timesheets/`)

```
index.tsx          Dashboard: this week summary + today's entries + quick-add
daily.tsx          Date-picker driven daily view, list of tasks, totals
history.tsx        Filterable/sortable table (date, project, search), CSV/PDF export
reports.tsx        Weekly + monthly totals, by-project breakdown, export
```

Plus admin: `src/routes/_authenticated/admin/timesheet-projects.tsx` for the project dropdown list.

Add a tile to `lab-logs/index.tsx` and to `admin/index.tsx`.

### 4. Components (`src/components/timesheets/`)

- `entry-form.tsx` — dialog form: date picker (defaults today), project select (dropdown + Other), task description, duration (decimal), optional start/end time, notes. Used for create + edit.
- `daily-list.tsx` — list of tasks for a date with edit/delete, total hours footer.
- `entries-table.tsx` — sortable/filterable table (same pattern as the new Standard Preps table).
- `filters-card.tsx` — date range, project, search.
- `summary-cards.tsx` — today / this week / this month total tiles.
- `weekly-breakdown.tsx` — 7-day bar/list with hours per day.
- `use-timesheets.ts` — TanStack Query hooks wrapping the server functions.

### 5. Exports

- **CSV** (`src/lib/timesheet-csv.ts`): columns Date, Project, Task, Start, End, Duration, Notes, User. Client-side `Blob` download, no extra deps.
- **PDF** (`src/lib/timesheet-pdf.ts`): use the existing **jsPDF + jspdf-autotable** stack already used by `coa-pdf.ts` / `coc-pdf.ts` / `material-receipt-pdf.ts` (no new dependency). Header with user name and period, autoTable of entries, totals footer.

Both exports respect the active filter (date range + project + search).

### 6. UI/UX

- Tailwind + shadcn primitives only (no inline colors). Mobile-first; current viewport is 411px so the daily view stacks vertically and the table becomes a card list under `md`.
- Navigation through the existing Lab Logs sidebar entry + tabs at the top of the Timesheets section (Dashboard / Daily / History / Reports).
- Search/filter in History and Reports; weekly + monthly totals in Reports.

### 7. Out of scope (call out before building)

- Timer/stopwatch entry
- Approval workflow / submitting timesheets to a manager
- Billable vs non-billable rates
- Team-wide reporting (admin can read-all, but no aggregated dashboard yet)

Happy to add any of these in a follow-up.

---

**Technical notes**
- Follows `server-side-modern` knowledge: client never imports `client.server.ts`; all writes go through `createServerFn` + `requireSupabaseAuth`.
- Query keys added to `src/lib/query-keys.ts` under `qk.timesheets.*`.
- Migration includes `GRANT` block (per `public-schema-grants` rule) and a `updated_at` trigger reusing the project's existing helper if present, otherwise a local `set_updated_at()` function.
- No edits to auto-generated files (`routeTree.gen.ts`, `types.ts`, `client.ts`).
