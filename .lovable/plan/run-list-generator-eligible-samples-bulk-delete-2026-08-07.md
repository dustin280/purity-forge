# Run List Generator: eligible samples + bulk delete

## Problem

The generator's "Analyze & propose" only looks at samples whose status is exactly **Received**. Your two samples (COC080726-101-01 and -02) are **In Progress**, so the optimizer sees zero candidates and reports "No sequences generated".

## What changes

### 1. Widen the eligible sample statuses

The generator will consider any sample that has not yet finished analysis:

- Received
- Intake verified
- Scheduled
- Prep
- In progress

Excluded: in analysis, on hold, reviewed, complete, approved, cancelled.

The empty-state message and page subtitle are updated so the wording matches ("pre-analysis samples" instead of "Received samples"), and the count in the toast reflects the wider set.

### 2. Bulk select and delete on the Run Lists page

On the saved Run Lists table:

- A checkbox in each row plus a select-all checkbox in the header
- A selection bar appears when one or more are checked, showing "N selected", a Clear button, and a Delete selected button
- Delete asks for confirmation, removes all selected run lists, clears the selection, and refreshes the table
- The existing per-row delete button stays

## Technical notes

- `src/lib/run-lists/generate.functions.ts` — replace `.eq("status", "received")` in `loadContext` with `.in("status", [...])` over the pre-analysis status list.
- `src/routes/_authenticated/run-lists/generate.tsx` — copy tweaks for the empty/`sample_count` toast and header text.
- `src/lib/run-lists.functions.ts` — add `deleteRunLists` (array of ids, capped, authenticated, reusing the existing delete path/RLS).
- `src/routes/_authenticated/run-lists/index.tsx` — selection state, checkbox column, header select-all, bulk action bar wired to the new server function with query invalidation.

No database or schema changes.