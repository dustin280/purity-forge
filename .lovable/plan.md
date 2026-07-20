## Goal
On the Vial Labels page, add a **Generate 1 Off Sequence** button next to Preview & Print. It builds an Agilent OpenLab-format CSV from the current label list (one row per label) and downloads it — no instrument, no optimizer, no DB persistence.

## Behavior
- Uses the label lines currently in the textarea (same set that would be printed, respecting start/end range so it matches what's on the sheet).
- Each label becomes one CSV row:
  - **Sample name**: the label text as entered (already includes `SYX-…_LOT` when coming from the run list handoff).
  - **Sample type**: `Sample` for all rows (blanks/QC keep their name but stay type `Sample` since we can't infer type from a label string).
  - **Vial**: sequential position starting from `P1-A1` across the standard 2×54 tray order, or left blank if user prefers — see Options below.
  - **Volume**: blank (= Use Method).
  - **Acq Method / Proc Method / Data file / Description / Level**: blank.
- Filename: `YYYY-MM-DD_OneOff_HHMMSS.csv`, UTF-8 with BOM, CRLF line endings (matches existing `sequenceToCsv`).
- Downloads via a Blob link; no server call, no `run_lists` row created.

## Options on the button
Small popover (or inline controls right by the button) with:
- **Starting vial position** text input (default `P1-A1`) — auto-increments A1→A6, B1…F6, then P2-A1… If left blank, Vial column is blank.
- Nothing else — everything else defaults to blank per above.

## Files to touch
- `src/routes/_authenticated/vial-labels.tsx` — add the button + click handler + small helper to build CSV and trigger download. Reuse the same `items` array already computed from `raw`.
- `src/lib/vial-labels/one-off-csv.ts` (new) — pure helper: `buildOneOffSequenceCsv(labels: string[], startVial?: string): string` and `nextVial(code)` iterator. Keeps the route file lean and unit-testable.

## Out of scope
- No DB write, no Drive push, no method/type inference from label text, no changes to the existing run list generator.
