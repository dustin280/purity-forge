## Goal

Convert the "Column" field in the Daily Backpressure Log into a dropdown sourced from a managed list of HPLC columns, and let users register a new column directly from a Material Receipt by ticking a checkbox.

## 1. New table: `hplc_columns`

Columns:
- `name` (text, unique) — display label shown in the dropdown
- `part_number` (text, optional)
- `source_receipt_id` (uuid, optional) — link back to the material receipt that registered it
- `is_active` (boolean, default true)
- standard `id`, `created_at`, `updated_at`, `created_by`

RLS:
- Select: any authenticated user
- Insert/Update: tech, reviewer, admin
- Delete: admin only

Seed three rows:
- AdvanceBio Peptide Plus 3.0 x 150 mm, 2.7 µm — P/N 693975-349
- Altura ZORBAX Eclipse Plus C18 1.8 µm, 2.1×50 mm — P/N 204205-308
- Altura ZORBAX Eclipse Plus C18 1.8 µm, 2.1×150 mm — P/N 204215-308

## 2. Server functions (`src/lib/hplc-columns.functions.ts`)

- `listHplcColumns()` — active columns, ordered by name
- `createHplcColumn({ name, part_number?, source_receipt_id? })` — used by both the admin screen and the material‑receipt "new column" flow; no-ops if the same name already exists

## 3. Backpressure log form

- Replace the "Column" text input with a `Select` populated from `listHplcColumns`
- Keep the existing `column_name` text field in the DB (store the selected column's display name)
- Add a small "Manage columns" link for admins pointing to a new admin route

## 4. Material Receipt form

- Add a checkbox **"Register this as a new HPLC column"** on the form (visible for both controlled and uncontrolled types, since columns can be either)
- When checked, on successful receipt creation the client calls `createHplcColumn` with the material name (and catalog number as part number) plus `source_receipt_id`
- Show a confirmation toast: "Column added to backpressure log selector"

## 5. Admin management page (light)

New route `/_authenticated/admin/hplc-columns` listing columns with the ability to deactivate or rename them. Linked from the existing admin index.

## Out of scope (phase 1)

- Tracking column usage history / serial numbers
- Auto‑linking past receipts retroactively
- Column lifecycle (injections per column, retirement)

## Open question

Should the "Register as new HPLC column" checkbox be **always visible** on every material receipt, or **only visible when the material name contains "column"** (auto‑detected)? Default in the plan is always visible.