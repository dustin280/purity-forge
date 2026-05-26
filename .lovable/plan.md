# Instrument Scheduler

A new sidebar item **Scheduler** (calendar icon) under Operations, accessible to all authenticated users. Admins additionally manage the instrument list.

## Data model (new migration)

**`instruments`** — admin-curated list
- `id uuid pk`, `name text not null unique`, `location text`, `notes text`, `is_active boolean default true`, `created_at`, `updated_at`
- RLS: select for all authenticated; insert/update/delete admin only.

**`instrument_bookings`** — reservations
- `id uuid pk`
- `instrument_id uuid not null` (references instruments)
- `user_id uuid not null` (booker)
- `user_name text not null` (snapshot for display)
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `purpose text` (short title shown on the calendar block)
- `notes text` (optional longer description)
- `created_at`, `updated_at`
- Index on `(instrument_id, starts_at, ends_at)`
- Validation trigger: `ends_at > starts_at`, max duration 14 days, `starts_at >= now() - interval '1 day'` on insert.
- **No-overlap enforcement**: trigger `prevent_booking_overlap()` runs on INSERT/UPDATE — rejects if any other booking for the same `instrument_id` has `tstzrange(starts_at, ends_at, '[)')` overlapping the new row. Returns a clear error message naming the conflicting booker + time.
- RLS:
  - select: all authenticated
  - insert: any tech/reviewer/admin where `user_id = auth.uid()`
  - update/delete: `user_id = auth.uid()` OR admin

## Server functions (`src/lib/instruments.functions.ts`, `src/lib/instrument-bookings.functions.ts`)

All use `requireSupabaseAuth`.

- `listInstruments()` → active instruments
- `adminUpsertInstrument(input)` / `adminDeleteInstrument({id})` — admin-only guard
- `listBookings({ from, to, instrumentId? })` → bookings in range with booker name
- `createBooking({ instrumentId, startsAt, endsAt, purpose, notes })`
- `updateBooking({ id, ... })`
- `deleteBooking({ id })`

Zod-validated inputs (ISO datetime strings, length caps). Surface overlap trigger errors as user-friendly messages.

## UI

**Route:** `src/routes/_authenticated/scheduler/index.tsx`
- Header: instrument selector (dropdown of active instruments; "All instruments" option for week/day views colored per instrument), view toggle (Week / Day / Month), prev/today/next nav, "New booking" button.
- **Week view** (default): horizontal day columns × hour rows (6am–10pm by default, scrollable), bookings rendered as positioned blocks showing purpose + booker initials. Click empty slot → new booking dialog prefilled; click block → details popover with edit/delete (own bookings or admin).
- **Day view**: single-day vertical timeline, same interactions.
- **Month view**: standard month grid; each cell lists up to 3 bookings (compact chips), "+N more" reveals day view.
- Color: each instrument gets a stable hue from semantic tokens; current user's own bookings get a subtle ring.
- Booking dialog: instrument, start date+time, end date+time (date pickers + time inputs), purpose (required, ≤80 chars), notes (optional, ≤500). Live conflict check before submit (client query against the loaded range). Server-side trigger is the source of truth.

**Components** (`src/components/scheduler/`):
- `scheduler-page.tsx` (orchestrator)
- `week-view.tsx`, `day-view.tsx`, `month-view.tsx`
- `booking-dialog.tsx`
- `booking-block.tsx` (renders a positioned block)
- `instrument-picker.tsx`
- `use-scheduler.ts` (TanStack Query hooks keyed on `[scope, instrumentId, fromISO, toISO]`)

**Admin instrument management:** new card on `/admin` route — list + add/edit/deactivate instruments. Existing admin page pattern reused.

## Files

**New**
- `supabase/migrations/{ts}_instrument_scheduler.sql`
- `src/lib/instruments.functions.ts`
- `src/lib/instrument-bookings.functions.ts`
- `src/routes/_authenticated/scheduler/index.tsx`
- `src/components/scheduler/scheduler-page.tsx`
- `src/components/scheduler/week-view.tsx`
- `src/components/scheduler/day-view.tsx`
- `src/components/scheduler/month-view.tsx`
- `src/components/scheduler/booking-dialog.tsx`
- `src/components/scheduler/booking-block.tsx`
- `src/components/scheduler/instrument-picker.tsx`
- `src/components/scheduler/use-scheduler.ts`
- `src/components/admin/instruments-admin.tsx`

**Edited**
- `src/components/lims/sidebar-nav.tsx` — add "Scheduler" (CalendarDays icon)
- `src/lib/query-keys.ts` — add scheduler keys
- `src/routes/_authenticated/admin/index.tsx` (or equivalent) — mount `InstrumentsAdmin`
- `src/integrations/supabase/types.ts` — regenerated post-migration

## Out of scope
- Recurring bookings, email/Slack reminders, ICS export, cross-day repeat patterns, sample/test linkage. Easy follow-ups once core is in.
