## 1. Add Lot to run list output

**Optimizer / review table** (`src/lib/run-lists/optimizer.ts`)
- Add `lot: string | null` to `OptimizerSample`.
- Sample row label in the review table becomes: `SYX-ID — compound (Lot: xxx)` so Lab Manager sees the lot inline.
- Also carry `lot` through `SequenceRow` so the CSV writer can use it.

**Sample loader** (`src/lib/run-lists/generate.functions.ts`)
- Extend the `samples` select to include `lot`.
- In `sequenceToCsv`, change the Agilent "Sample name" column from the review label to `SYX-ID_Lot` (join with `_`; fall back to just SYX-ID when lot is empty). "Description" keeps the method group name.
- Pass `lot` through the `rows` payload that `generateAndSaveRunList` accepts, so overrides made on the review screen still produce the right instrument-facing name.

**Review UI** (`src/routes/_authenticated/run-lists/generate.tsx`)
- Show lot in the Sample column so it matches what will land in the LIMS run list record.
- Include `lot` when sending rows to `generateAndSaveRunList`.

QC rows (NIB/ICB/ICV/CCB/CCV) are unchanged — no lot.

## 2. Method dropdown showing Archive contents

The `Method (OpenLab)` selector on `/run-lists/$id` reads `openlab_methods`, which is populated by pulling every `.M` folder from the Drive **Methods** folder configured in OpenLab Settings. Right now that folder resolves to a location that includes your Archive subfolder, so archived methods appear alongside (or instead of) General AQ / Polar AQ / Hydrophobic AQ.

Proposed fix — do both so the list is correct today and stays correct:

1. **Filter on sync**: in `syncKind` / `pullFromDrive` (`src/lib/openlab-drive.functions.ts`), skip any file or `.M` folder whose Drive path contains a segment named `Archive` (case-insensitive). Recorded `relative_path` already includes ancestor segments during recursion; for the top-level list we also skip a folder literally named `Archive` when walking.
2. **Point at the right folder**: confirm the Drive Methods folder ID in OpenLab Settings is the one that contains General AQ, Polar AQ, and Hydrophobic AQ (not the parent that also contains Archive). If you paste the correct folder URL, I'll set it as part of the change; otherwise I'll leave the current value and rely on the Archive filter.
3. After the change, hit **Pull from Drive** on the OpenLab settings card to refresh `openlab_methods`.

## Questions before I build

- For the instrument-facing **Sample name**, confirm `SYX-000002-02_LOT123` (SYX ID + `_` + lot, no compound) is what you want. If lot is missing, use SYX ID alone — OK?
- Do you want me to add the Archive filter and keep your current Methods folder, or will you share the Drive URL of the folder that actually holds the three active methods so I switch it at the same time?
