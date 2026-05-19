## Goal

Fix the Chain of Custody intake form so per-product info lives on each line item, multi-vial intake is supported, data isn't lost by an accidental click, and package condition can include photos.

## Changes

### 1. Move ambiguous header fields onto the line item

Currently `Product Name`, `Catalog / Product Code`, `Lot / Batch Number`, `Quantity Received`, and `Container Size / Concentration per Vial` are header fields, but a single CoC carries multiple products. Make them per-row instead.

- In the **CoC field admin** (`/admin/coc-fields`), deactivate (or auto-hide) those five header fields so they stop showing in the header section.
- Extend the line-item editor in `chain-of-custody.tsx` with the missing columns:
  - Product Name (rename current "Compound" label to "Product / Compound")
  - Catalog / Product Code
  - Lot / Batch
  - Container size / Concentration per vial (new)
  - Quantity received + unit (new dedicated unit field)
- Persist the new fields on `chain_of_custody_records.line_items` (jsonb, no migration needed) and copy them down to each generated sample row (extend `samples` with `container_size text` and `concentration text` via migration; reuse existing `lot`/`compound` columns).
- Update the CoC PDF (`coc-pdf.ts`) to render the line items as a table with the new columns, since header values no longer carry that info.

### 2. Multi-vial support on requested tests

Today each row has a `requested_tests` multiselect with no count. Add a `vial_count` integer (default 1) per row, plus a `tests_per_vial` toggle so the user can say "2 vials, each gets these tests".

- On submit, expand each line item into `vial_count` sample rows. Sample IDs continue the existing zero-padded sequence (`COC051926-100-01`, `-02`, …) across all vials of all rows in row+vial order.
- Show a small "× 2 vials" badge in the line-item header so the user sees what they'll get.

### 3. Don't lose data on outside click

`Dialog` from shadcn closes on overlay click and Esc. Wrap the form's `onOpenChange` so that when the user has typed anything (dirty state) and tries to close without submitting:
- Intercept and show a confirm prompt: "Close without completing? Your data will be lost."
- Confirm → close and reset. Cancel → keep dialog open.
- Hitting **Cancel** in the footer goes through the same gate.
- The existing **Submit** path closes cleanly with no prompt.
- Track dirtiness with a single `isDirty` flag toggled on any `setValues`/`setLineItems` change.

### 4. Photo upload + camera capture for package condition

The `package_condition` / `physical_description` field is currently text-only. Add an attachment uploader directly under it:

- New table `coc_attachments` (id, coc_id, file_name, file_path, content_type, size_bytes, uploaded_by, uploaded_at) with RLS mirroring `issue_report_attachments`.
- New storage bucket `coc-attachments` (private) with the standard authenticated read/write policies.
- New server fns in `lims.functions.ts`: `recordCocAttachment`, `listCocAttachments`, `deleteCocAttachment`, `signedCocAttachmentUrl`.
- In the form, render a thumbnail strip + two buttons: **Upload image** (`<input type="file" accept="image/*" multiple>`) and **Take photo** (`<input type="file" accept="image/*" capture="environment">` — works on mobile and on desktop browsers that expose a webcam). Uploads happen after the CoC is saved; on the New-CoC flow, files are queued locally and uploaded once the record exists (same pattern as `material-receipts/new.tsx`'s `uploadPending`).
- Show existing attachments on the View dialog and embed them in the PDF as a "Package photos" appendix.

## Technical notes

- DB migrations:
  1. `alter table samples add column container_size text, add column concentration text;`
  2. `create table coc_attachments (...)` + RLS + bucket + bucket policies.
- No new packages required; reuse existing `supabase.storage`, `jspdf`, shadcn `Dialog`/`Input`/`Badge`.
- The header-field deactivation is data, not schema — done via `supabase--insert` updating `chain_of_custody_fields.is_active = false` for the five keys.
- `coc-pdf.ts` gets a new "Line items" section that iterates `rec.line_items` with the expanded columns, and an optional "Photos" section that embeds signed-URL images.

## Open questions

- Should `vial_count > 1` create one sample row per vial (recommended, so each vial gets its own Sample ID and prep record) or a single sample row with a `vial_count` column? Default in this plan: one sample row per vial.
- For the dirty-state prompt, do you want the same gate on the **Edit** dialog, or only on **New CoC**? Default: both.