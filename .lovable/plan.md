# Fix date/time entry on Sample Receipt

## What's wrong

The "Date and Time of Receipt" field on the New Sample Receipt dialog is a plain browser
date/time box that starts completely empty and is marked required. Two problems follow:

1. Nothing is pre-filled, so every user has to type the full date, hour, minute AND the
   AM/PM segment by hand. Missing any segment (as in the screenshot, where AM/PM is still
   `--`) makes the browser refuse the form with the generic
   "Please enter a valid value. The field is incomplete or has an invalid date."
2. When a record is re-opened or a saved draft is resumed, the stored value is handed to
   the field as-is. Any value that isn't exactly in the browser's expected
   `YYYY-MM-DDTHH:MM` shape (for example a full timestamp with seconds/timezone, or a
   `MM/DD/YYYY` string) is silently dropped, so the field appears blank or half-filled.

## What will change

- New sample receipts pre-fill the receipt date/time with the current local date and time,
  so the common case is one click, not eight keystrokes.
- Any existing value (edit mode, resumed draft, or data pre-populated from an uploaded
  Chain of Custody) is normalized into the shape the picker understands, so previously
  saved dates load correctly instead of showing blank/partial.
- Add a small "Now" button beside the field to reset it to the current time.
- Plain-date fields get the same normalization so they never load half-filled.

## Technical notes

- Add a small date helper (e.g. `toLocalDatetimeInput` / `toDateInput`) that converts an
  arbitrary stored string into `YYYY-MM-DDTHH:MM` and `YYYY-MM-DD` respectively, returning
  `""` when unparseable.
- In `src/components/chain-of-custody/use-coc-form.ts` hydration: run stored values for
  `datetime`/`date` fields through the helper, and when creating a new record seed
  `datetime` fields with the current local time.
- In `src/components/chain-of-custody/coc-form-dialog.tsx`: render the datetime input with
  the normalized value plus a "Now" action; no change to the save payload shape.
- Saving continues to send the same string to the backend — no schema or server-function
  changes.
