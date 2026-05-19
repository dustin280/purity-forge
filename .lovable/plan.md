
## Goal

Shift intake from "one sample at a time" to a COC-driven flow: a single CoC carries multiple compounds/lots, each becomes its own staged sample with a unique Sample ID, and a lab worker verifies each one before it moves to prep.

## Workflow

```text
Submit CoC (with line items)
      │
      ▼
[Received]  ──►  Intake staging queue (one row per line item, auto Sample IDs)
      │
      ▼   (lab worker opens a staged sample, confirms client/project + requested tests)
[Intake Verified]
      │
      ▼
[Prep]  ──►  [In Progress]  ──►  [Reviewed]  ──►  [Complete]
```

Statuses: `received → intake_verified → prep → in_progress → reviewed → complete`.

## CoC form changes

Add a repeatable **Compounds / Lots** line-item table to the CoC fillable form. Each row captures the per-sample fields that vary across the shipment:

- Compound / Product name
- Lot / Batch
- Catalog / Product code (optional)
- Manufacturer + Mfg date (optional, defaults to header value)
- Quantity received / units
- Requested tests (multiselect, pre-filled from CoC header, editable per row)
- Storage condition (per row, optional override)

Header fields stay as today (client, contact, shipping, temp, purpose, etc.). The admin CoC field editor gets a new "line-item field" toggle so admins can curate which columns appear in the table.

## Sample ID

Replaces "Batch ID" on the sample record. Format derived from the CoC Invoice #:

```text
COC051926-100-01
COC051926-100-02
└─CoC invoice──┘ └─line #─┘
```

Auto-assigned at the moment the CoC is submitted (one ID per line item, zero-padded 2-digit sequence). Read-only on the sample, displayed everywhere `batch_id` is shown today.

## Intake staging area

New page **Intake** (sidebar item, between Chain of Custody and Samples). Shows all samples with `status = received`, grouped by CoC, with columns: Sample ID, Compound, Lot, Client, Requested tests, Received date, Action.

Each row has a **Verify intake** action that opens a focused dialog:

1. Header (read-only): CoC #, client, project, received date
2. Confirm / edit: Client, Project, Compound, Lot, Requested tests (parameters multiselect, pre-filled)
3. Optional: storage location, internal notes
4. Submit → status becomes `intake_verified`, then auto-advances to `prep` and the sample drops off the intake queue into the Samples list flagged "Ready for prep"

Bulk "Verify all from this CoC" shortcut when the staged rows need no edits.

## Suggestions / optimizations

- **Auto-fill Requested tests per row** from the CoC header, but allow row-level overrides at submit time so the staging step is mostly a confirmation, not data entry.
- **Print/label hand-off**: add a "Print labels" button on the intake queue that produces a PDF of Sample ID + compound + lot barcodes (QR) for each staged sample. This is the choke point in most real labs — worth doing now.
- **Discrepancy flag** on the verify dialog ("Compound mismatch", "Lot illegible", "Damaged") that captures a reason and keeps the sample in `received` with a visible badge instead of advancing it. Avoids silent edits.
- **CoC lock on submit**: once line items create samples, the CoC line-item table becomes read-only (edits require admin) so Sample IDs stay stable.
- **Prep queue** as a saved filter on the existing Samples page (`status = prep`) — no new page needed yet; revisit if prep grows its own workflow.

## Technical sketch (for engineering, skim-friendly)

- DB: add `chain_of_custody_records.line_items jsonb`, add `samples.coc_id uuid` + `samples.coc_line_no int` + `samples.compound text` + `samples.lot text`, extend `sample_status` enum with `intake_verified`, `prep`, `complete`; remove/retire `approved` (or alias to `complete`).
- Server fns: `submitCocWithSamples` (atomic: insert CoC + N samples with generated Sample IDs), `listIntakeQueue`, `verifySampleIntake`, `bulkVerifyCoc`.
- UI: extend `/chain-of-custody` form with line-item editor; new `/intake` route; rename "Batch ID" → "Sample ID" everywhere; remove the standalone "New Sample" intake path (or keep it admin-only as an escape hatch).
- Keep audit trail via existing `audit_log` trigger on `samples` and `chain_of_custody_records`.

## Open questions to resolve during build

- Should `complete` replace `approved` everywhere (incl. existing rows) or coexist? Default: rename via migration since no production data depends on it.
- Should the standalone "New Sample" form stay as an admin escape hatch, or be removed entirely? Default: keep, admin-only.
