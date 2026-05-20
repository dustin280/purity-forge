## Goal

Turn the prep form into a **batch journal entry**: the calculator's target rows become the final standards saved to the Standard Preparation Log — one log row per standard — each with a unique SYN ID.

## SYN ID format

`SYN_[mmddyy]_[user]_[n]` where:
- `mmddyy` = preparation date
- `user` = analyst initials (uppercase, derived from first + last name; falls back to email prefix)
- `n` = **daily journal line number**, global across all analysts, DB-enforced unique per day

Example: `SYN_052026_JDS_7` is the 7th standard prepared anywhere in the lab on May 20 2026.

## Database changes

New migration:

1. **`syn_id_counters`** table — `day date primary key`, `last_seq int not null default 0`.
2. **`next_syn_id(p_user_token text, p_day date)`** SECURITY DEFINER function — atomically increments the day's counter and returns the full `SYN_mmddyy_USER_n` string. Uniqueness enforced by the counter, not by `UPDATE` races.
3. **`standard_preparation_logs.syn_id text`** column + `UNIQUE` index. Backfill is not needed (existing rows stay `NULL`).
4. **`standard_preparation_logs.batch_group_id uuid`** column — same value for every row saved together so the journal view can group them.

The existing `standard_preparation_targets` table stays for traceability of *intermediate* calculator rows, but the **final saved standards now live as siblings in `standard_preparation_logs`**, not as children of one log.

## Server function changes (`src/lib/standard-preparations.functions.ts`)

Add `createStandardPreparationBatch`:
- Input: the shared prep fields (analyst, reference material, expiration, diluent, etc.) + an array of target rows from the calculator.
- For each target row, in a single transaction:
  1. Call `next_syn_id(user_token, prepared_at::date)` once to get the SYN ID.
  2. Insert a `standard_preparation_logs` row, copying the shared fields, setting `standard_name = target.name`, `target_concentration = target.target_concentration_mg_per_ml`, `final_volume = target.target_volume_ml`, `syn_id`, and a shared `batch_group_id`.
  3. Insert the matching `standard_preparation_targets` child row on that new log (keeps the calculated mass / volume audit).
- Returns `{ rows: [{ id, log_number, syn_id, standard_name }], batch_group_id }`.

Keep the old `createStandardPreparation` for backwards compatibility, but the New Preparation page calls the batch version.

Add `analystInitials(profile)` helper in `src/lib/lims-utils.ts` (first letter of first + middle words of full_name, uppercase; fallback = email prefix uppercased, max 4 chars).

## Form changes (`src/components/standard-preparations/prep-form.tsx`)

- Remove the single `standard_name` input from the "Standard Identity" section — the targets table IS the list of standards now. The section becomes a single optional **Batch label / project** field.
- Above the targets table, show a live preview column **"SYN ID (preview)"** for each row: `SYN_052026_JDS_?` — the `?` is shown until save (since the counter is daily-global, real numbers are assigned server-side). Helper text: "Final IDs assigned in order on save."
- Validation: require at least one target row with a non-empty name and a concentration OR volume before submit is enabled.
- Submit button label: "Save N standards to log" (live count).
- On success, navigate to a new **batch view** route (below) instead of a single prep page.

## New batch view

`src/routes/_authenticated/lab-logs/standard-preparations/batch.$groupId.tsx`
- Header: prep date, analyst, reference material card (one snapshot for the whole batch).
- Table of saved standards: SYN ID, log #, name, conc, vol, mass, expiration. Each row links to its individual prep detail.
- "Copy all SYN IDs" and "Copy summary" buttons.

The single prep detail page (`$id.tsx`) keeps working unchanged — every row in the batch is still a normal log entry, and now displays its `SYN ID` and a "View batch" link when `batch_group_id` is set.

## List page

`src/routes/_authenticated/lab-logs/standard-preparations/index.tsx` gets a new "SYN ID" column and a small grouping affordance: rows sharing a `batch_group_id` show a subtle batch chip you can click to open the batch view.

## Material Receipt detail page

The "Standards Prepared From This Receipt" table picks up the new `syn_id` column.

## Out of scope

- Editing an existing batch as a batch (each row is still edited individually).
- PDF batch report (separate follow-up).
- Renaming/renumbering already-saved SYN IDs.

## Files to add / change

- `supabase/migrations/<new>.sql` — counter table, `next_syn_id` function, `syn_id` + `batch_group_id` columns + unique index.
- `src/lib/lims-utils.ts` — `analystInitials` helper.
- `src/lib/standard-preparations.functions.ts` — `createStandardPreparationBatch`, return shape for batch view.
- `src/components/standard-preparations/prep-form.tsx` — remove single-standard fields, SYN preview column, batch submit.
- `src/routes/_authenticated/lab-logs/standard-preparations/new.tsx` — call batch function, redirect to batch view.
- `src/routes/_authenticated/lab-logs/standard-preparations/batch.$groupId.tsx` — new.
- `src/routes/_authenticated/lab-logs/standard-preparations/$id.tsx` — show SYN ID + batch link.
- `src/routes/_authenticated/lab-logs/standard-preparations/index.tsx` — SYN ID column + batch chip.
- `src/routes/_authenticated/material-receipts/$id.tsx` — add SYN ID column.

Ready to implement on approval.