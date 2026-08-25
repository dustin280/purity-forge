# Chromatogram Converter

Runs on the lab PC that exports OpenLab CDS reports into the Drive-synced
"LM-Reports Complete" folder. Every few minutes it scans that folder for
`.xlsx` reports, pulls out every embedded picture (the chromatogram trace
plus one calibration-curve chart per compound on the report), and — for
any that are Windows EMF metafiles (the default when a picture was pasted
from the clipboard) — converts them to PNG using .NET's built-in GDI+
renderer. No Office/Excel install or external tools (ImageMagick,
LibreOffice, etc.) are needed; `System.Drawing.Imaging.Metafile` is part
of the .NET runtime on Windows and renders EMF exactly the way Windows
already does when you open the file.

Pictures are found by walking the real OOXML relationship graph (workbook
→ sheets → drawings → media), not just reading `xl/media/*` in zip order —
a report's chromatogram and its calibration curve(s) can be spread across
one or two sheets depending on how OpenLab exported it. The chromatogram
is identified as the largest embedded picture by area (reliably and
clearly bigger than any calibration-curve thumbnail); everything else is
a calibration curve, one per compound.

Converted images are written as **sibling files** next to the report —
`ER MOTS Xavier.xlsx` → `ER MOTS Xavier.chromatogram.png` — rather than
rewriting the xlsx's internal zip/relationship structure, which is
fragile and easy to corrupt. A report with exactly one calibration curve
gets `ER MOTS Xavier.calibration.png`; a blend with several compounds
gets one per compound, named from that curve's own "Compound: X" label on
the sheet — `ER MOTS Xavier.calibration.Cartalax.png`,
`ER MOTS Xavier.calibration.TB500.png`, etc. (falls back to a numbered
suffix if a curve's compound label can't be resolved). The siblings sync
up to Drive right alongside the report itself, and the purity-forge
server picks them up automatically when it processes that report (see
`findChromatogramImage`/`findCalibrationImage` in
`src/lib/results/drive-reports.functions.ts`) — no server-side change is
needed per report. If an embedded picture is already a PNG, it's copied
through unchanged; the original `.xlsx` is never modified.

## Requirements

- Windows (uses GDI+ / `System.Drawing.Common`, which is Windows-only).
- [.NET 8 Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (or SDK) installed on the lab PC.

## Build & publish

From this folder, on the lab PC (or anywhere with the .NET 8 SDK):

```
dotnet publish -c Release -r win-x64 --self-contained false -o publish
```

This produces `publish\ChromatogramConverter.exe` and copies
`appsettings.json`, `register-task.ps1` alongside it.

## Configure

Edit `publish\appsettings.json`:

```json
{
  "WatchFolder": "C:\\Users\\<you>\\Google Drive\\LM-Reports Complete",
  "LogFile": "converter.log",
  "TargetWidthPx": 900
}
```

Point `WatchFolder` at the **local** folder the Drive Desktop sync client
keeps in sync with the "LM-Reports Complete" Drive folder — not a Drive
API path. This tool never talks to the Drive API directly; it just
watches the local filesystem that Drive is already syncing, the same way
OpenLab's own export lands there.

You can also override the folder for a single run without editing the
file:

```
ChromatogramConverter.exe --folder "C:\path\to\LM-Reports Complete"
```

## Run it on a schedule

The tool does **one pass** over the folder and exits — it's meant to be
triggered periodically by Task Scheduler, not run as a long-lived
background process. That keeps it simple (no crash-restart logic to get
wrong) and lets Windows handle scheduling, logging of run history, and
restart-on-failure natively.

From an **elevated** PowerShell prompt, in the `publish` folder:

```
.\register-task.ps1
```

This registers a task named `SynthesyxChromatogramConverter` that runs
every 5 minutes. Pass `-IntervalMinutes` to change that, or `-TaskName`
to use a different name. To remove it later:

```
Unregister-ScheduledTask -TaskName SynthesyxChromatogramConverter
```

## Logs

Each run appends to `converter.log` next to the exe (path is configurable
via `LogFile` in `appsettings.json`). Check there first if a report isn't
getting its `.chromatogram.png`/`.calibration*.png` siblings — it logs why
a file was skipped (still being written, no embedded pictures,
unrecognized image format, already converted) as well as any failures.

## Notes / limitations

- Each output sibling is only rewritten if the xlsx's own last-write time
  is newer than that specific sibling, checked independently per file —
  so a report whose chromatogram is already up to date but whose
  calibration curves are missing or stale (e.g. reprocessed after this
  multi-curve support was added) gets just the missing/stale ones
  backfilled, not skipped as a whole.
- Never modifies the original `.xlsx` — always writes separate sibling
  files, so a bug here can't corrupt the source report.
- Compound-name resolution for calibration curves depends on a
  "Compound: <name>" label cell existing on the same sheet as that curve's
  picture (the current report template always has one) — a curve whose
  label can't be resolved falls back to a numbered filename instead of a
  compound name, it's never dropped.
