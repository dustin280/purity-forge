# Chromatogram Converter

Runs on the lab PC that exports OpenLab CDS reports into the Drive-synced
"LM-Reports Complete" folder. Every few minutes it scans that folder for
`.xlsx` reports, pulls out the embedded chromatogram picture, and — if
it's a Windows EMF metafile (the default when the picture was pasted from
the clipboard) — converts it to PNG using .NET's built-in GDI+ renderer.
No Office/Excel install or external tools (ImageMagick, LibreOffice, etc.)
are needed; `System.Drawing.Imaging.Metafile` is part of the .NET runtime
on Windows and renders EMF exactly the way Windows already does when you
open the file.

The converted image is written as a **sibling file** next to the report —
`ER MOTS Xavier.xlsx` → `ER MOTS Xavier.chromatogram.png` — rather than
rewriting the xlsx's internal zip/relationship structure, which is
fragile and easy to corrupt. The sibling syncs up to Drive right alongside
the report itself, and the purity-forge server picks it up automatically
when it processes that report (see `findChromatogramImage` in
`src/lib/results/drive-reports.functions.ts`) — no server-side change is
needed per report. If the embedded picture is already a PNG, it's copied
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
getting a `.chromatogram.png` sibling — it logs why a file was skipped
(still being written, no embedded picture, unrecognized image format,
already converted) as well as any failures.

## Notes / limitations

- Only the **first** embedded picture in each report is converted — fine
  for the current single-chromatogram report template. A report with
  multiple embedded pictures logs a warning and only converts the first;
  extend `ExtractFirstMediaEntry` in `Program.cs` if that ever changes.
- A report is only reconverted if the xlsx's own last-write time is newer
  than its existing `.chromatogram.png` sibling, so reprocessing a rerun
  report picks up the change automatically without redoing untouched
  reports every pass.
- Never modifies the original `.xlsx` — always writes a separate sibling
  file, so a bug here can't corrupt the source report.
