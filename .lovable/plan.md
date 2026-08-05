# End-to-End Test Walkthrough: Sample In The Door to Report Out

A manual QA script for the sample management system. Run it in one sitting using a throwaway client name (e.g. "QA TEST CO") so test data is easy to find and delete afterwards. Expected result is listed under each step.

## 0. Setup

1. Sign in as an admin user.
2. Clients: add "QA TEST CO" with contact and email. Expect the client to appear in the list.
3. Admin > Parameters: confirm at least one test parameter exists (e.g. Purity HPLC).
4. Admin > Compounds: confirm your test compound exists (e.g. SS31).

## 1. Sample arrives at the door

Pick one of the two entry paths, or do both for full coverage.

### Path A - walk-in sample with paper CoC

1. Sample Receipt > Print Blank CoC. Expect a PDF download plus a toast showing an issued Lab Sample ID such as COC080526-100.
2. Fill the form by hand, then Upload / Photo CoC and pick the photo or PDF. Expect the new Sample Receipt dialog to open with the file attached and a toast naming the file.
3. Complete the header (client QA TEST CO, project, date received) and add two line items:
   - Line 1: compound SS31, lot QA-L1, 2 vials, concentration 1 mg/mL, requested tests selected.
   - Line 2: a second compound, 1 vial.
4. Save. Expect the record in the Sample Receipt list; opening it shows both line items and the attachment.

### Path B - partner web order via webhook

1. Have the partner site (or a signed test POST to /api/public/orders/intake) send an order.
2. Pending Orders > Pending tab. Expect the order listed as Pending with the raw payload viewable.
3. Click through to receive it. Expect the Sample Receipt dialog to open pre-filled from the order.
4. Save the receipt. Expect the pending order to flip to Received and link to the new CoC.

## 2. Samples are created

1. Samples list. Expect one row per vial, IDs suffixed -01, -02, ... under the parent lab sample ID, status "received".
2. Open one sample. Expect client, project, compound, lot, concentration, container and requested parameters carried over from the receipt line item.

## 3. Intake verification

1. Intake. Expect every newly created vial in the Intake Queue.
2. Click Verify on one, correct any field, confirm.
3. Expect it to leave the queue, status to move to "prep" on the Samples list, a default test to be auto-assigned, and Admin > Audit Log to show an intake_verified entry.
4. Repeat for the remaining vials.

## 4. Sample preparation

Quick path:

1. Sample Prep > Quick Dilution: enter 10 mg/mL in 1 mL going to 0.1 mg/mL in 1 mL. Expect a serial dilution proposal rather than any pipette step below 10 uL.
2. Print or save to PDF. Expect each prep sheet on its own page, no clipped last page, and no app header in the printout.

Method-driven path:

1. Sample Prep > New Preparation: pick analyte and method, walk the wizard, save as draft.
2. Open the record under Records, enter bench actuals, drag and drop a photo attachment. Expect the attachment to list and open via signed link, and deviations to be captured against planned values.

## 5. Analysis queue and run list

1. Analysis Queue: confirm the prepped samples appear with due-date and at-risk info.
2. Run Lists > Generate: select instrument, method group, and the prepped samples.
3. Generate. Expect samples grouped by compound and ordered low to high concentration, QC and blanks interleaved, injection volume defaulting to "Use Method".
4. Use the sequence selector to pick Sequence 1 only, then Download. Expect an Agilent-format CSV where Sample name is SYX-ID_Lot, with no garbled characters.
5. Export to Drive. Expect a success toast and the file in Peptides2026/Sequences.
6. Print Labels. Expect Vial Labels to open pre-filled with sample IDs, lots and tray positions for samples, blanks and QC, and after printing to offer a return to the run list you came from.

## 6. Results and reporting

1. Open a sample > Results tab and enter or import peak results.
2. Move the status through review to complete. Expect audit entries at each transition.
3. Generate the CoA from the sample's CoA tab. Expect a branded PDF with the correct client, lab sample ID, lot and results.

## 7. Partner status feed

1. GET /api/public/status/{batchId}. Expect JSON with the current stage and percent complete matching the in-app status.
2. GET /api/public/status. Expect the bulk feed to list your QA samples with the same values.

## 8. Cleanup

Delete the QA CoC record (admin only), the generated run list, the prep records, and the QA TEST CO client.

## What to record while testing

For each step note pass or fail, the exact toast or error text, and the URL. Report any failure with the sample ID so it can be traced through the Audit Log.