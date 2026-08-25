using System.IO.Compression;
using System.Threading;
using System.Xml.Linq;
using ChromatogramConverter;

string exeDir = AppContext.BaseDirectory;
string configPath = Path.Combine(exeDir, "appsettings.json");

string? folderArg = null;
for (int i = 0; i < args.Length; i++)
{
    if (args[i] == "--folder" && i + 1 < args.Length) folderArg = args[i + 1];
}

AppConfig config = AppConfig.Load(configPath, folderArg);
string logPath = Path.IsPathRooted(config.LogFile) ? config.LogFile : Path.Combine(exeDir, config.LogFile);
var log = new Logger(logPath);

if (string.IsNullOrWhiteSpace(config.WatchFolder) || !Directory.Exists(config.WatchFolder))
{
    log.Error($"Watch folder not found or not configured: '{config.WatchFolder}'. " +
              "Set WatchFolder in appsettings.json or pass --folder \"C:\\path\".");
    return 1;
}

log.Info($"Scanning '{config.WatchFolder}' for report xlsx files…");

int converted = 0, skipped = 0, failed = 0;

foreach (string xlsxPath in Directory.EnumerateFiles(config.WatchFolder, "*.xlsx", SearchOption.TopDirectoryOnly))
{
    string dir = Path.GetDirectoryName(xlsxPath)!;
    string baseName = Path.GetFileNameWithoutExtension(xlsxPath);

    try
    {
        if (!IsFileStable(xlsxPath))
        {
            log.Info($"Skipping '{Path.GetFileName(xlsxPath)}' — still being written, will retry next run.");
            skipped++;
            continue;
        }

        DateTime xlsxWritten = File.GetLastWriteTimeUtc(xlsxPath);

        List<ExtractedPicture> pictures = ExtractPictures(xlsxPath, log);
        if (pictures.Count == 0)
        {
            log.Warn($"No embedded pictures found in '{Path.GetFileName(xlsxPath)}' — skipping.");
            skipped++;
            continue;
        }

        // The chromatogram trace is reliably the largest embedded picture by
        // area in every report template observed (single fixed export size,
        // clearly bigger than any calibration-curve thumbnail) -- everything
        // else on the workbook is a calibration curve, one per compound,
        // kept in document order (sheet order, then top-to-bottom anchor
        // order within a sheet).
        ExtractedPicture chromatogram = pictures.OrderByDescending(p => p.AreaEmu).First();
        List<ExtractedPicture> calibrations = pictures.Where(p => p != chromatogram).ToList();

        var outputs = new List<(string Path, byte[] Bytes, string Label)>();
        outputs.Add((Path.Combine(dir, baseName + ".chromatogram.png"), chromatogram.Bytes, "chromatogram"));
        if (calibrations.Count == 1)
        {
            // Single calibration curve: keep the original flat filename so
            // existing consumers (findCalibrationImage in purity-forge) keep
            // working unchanged for the common single-compound case.
            outputs.Add((Path.Combine(dir, baseName + ".calibration.png"), calibrations[0].Bytes, "calibration"));
        }
        else
        {
            for (int i = 0; i < calibrations.Count; i++)
            {
                string label = SanitizeForFileName(calibrations[i].CompoundName) ?? (i + 1).ToString();
                outputs.Add((Path.Combine(dir, $"{baseName}.calibration.{label}.png"), calibrations[i].Bytes, $"calibration ({calibrations[i].CompoundName ?? $"curve {i + 1}"})"));
            }
            log.Info($"'{Path.GetFileName(xlsxPath)}' has {calibrations.Count} calibration curves — writing one PNG per compound.");
        }

        bool anyWritten = false;
        foreach (var (outPath, rawBytes, label) in outputs)
        {
            if (File.Exists(outPath) && File.GetLastWriteTimeUtc(outPath) >= xlsxWritten)
                continue; // this sibling is already up to date

            byte[] pngBytes;
            switch (EmfConverter.Detect(rawBytes))
            {
                case EmfConverter.ImageKind.Png:
                    pngBytes = rawBytes;
                    break;
                case EmfConverter.ImageKind.Emf:
                    pngBytes = EmfConverter.EmfToPng(rawBytes, config.TargetWidthPx);
                    break;
                default:
                    log.Warn($"Embedded {label} picture in '{Path.GetFileName(xlsxPath)}' is neither PNG nor EMF — skipping it.");
                    continue;
            }

            string tempPath = outPath + ".tmp";
            File.WriteAllBytes(tempPath, pngBytes);
            File.Move(tempPath, outPath, overwrite: true);
            log.Info($"Converted '{Path.GetFileName(xlsxPath)}' [{label}] -> '{Path.GetFileName(outPath)}' ({pngBytes.Length:N0} bytes).");
            anyWritten = true;
        }

        if (anyWritten) converted++; else skipped++;
    }
    catch (Exception ex)
    {
        log.Error($"Failed to process '{Path.GetFileName(xlsxPath)}': {ex.Message}");
        failed++;
    }
}

log.Info($"Done. Converted={converted} Skipped={skipped} Failed={failed}.");
return failed > 0 ? 2 : 0;

// Guards against reading a report the Drive sync client (or the OpenLab
// export itself) is still actively writing — compares file size across a
// short delay and only proceeds once it has stopped changing.
static bool IsFileStable(string path)
{
    try
    {
        long size1 = new FileInfo(path).Length;
        Thread.Sleep(1000);
        long size2 = new FileInfo(path).Length;
        return size1 == size2;
    }
    catch (IOException)
    {
        return false; // still locked by whatever is writing it
    }
}

static string? SanitizeForFileName(string? name)
{
    if (string.IsNullOrWhiteSpace(name)) return null;
    char[] invalid = Path.GetInvalidFileNameChars();
    string cleaned = new string(name.Where(c => !invalid.Contains(c) && c != ' ').ToArray());
    return cleaned.Length > 0 ? cleaned : null;
}

// Walks the real OOXML relationship graph (workbook -> sheets -> drawings ->
// media) instead of just reading xl/media/* in zip-entry order, so pictures
// are correctly attributed to their sheet/position and every embedded
// picture is returned (a report can spread its chromatogram and N
// calibration curves across one or two sheets depending on how OpenLab
// exported it -- both layouts have been observed in real reports). Each
// calibration picture's compound name is resolved from a "Compound:" /
// <name> label pair on the same sheet, matched to pictures in document
// order; a picture with no resolvable label falls back to numbering.
static List<ExtractedPicture> ExtractPictures(string xlsxPath, Logger log)
{
    using FileStream fs = File.Open(xlsxPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
    using ZipArchive zip = new(fs, ZipArchiveMode.Read);

    XNamespace rel = "http://schemas.openxmlformats.org/package/2006/relationships";
    XNamespace r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    XNamespace xMain = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    XNamespace xdr = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";

    ZipArchiveEntry? Find(string path) => zip.GetEntry(path.TrimStart('/'));
    XDocument Load(ZipArchiveEntry entry) { using var s = entry.Open(); return XDocument.Load(s); }

    var workbookEntry = Find("xl/workbook.xml");
    if (workbookEntry is null) return new();
    XDocument workbook = Load(workbookEntry);

    var workbookRelsEntry = Find("xl/_rels/workbook.xml.rels");
    var workbookRels = workbookRelsEntry is not null ? Load(workbookRelsEntry) : null;
    var sheetPartById = workbookRels?.Root?.Elements(rel + "Relationship")
        .Where(e => (string?)e.Attribute("Type") == "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet")
        .ToDictionary(e => (string)e.Attribute("Id")!, e => ResolveTarget("xl/workbook.xml", (string)e.Attribute("Target")!)) ?? new();

    string[] sharedStrings = LoadSharedStrings(Find("xl/sharedStrings.xml"));

    var pictures = new List<ExtractedPicture>();

    foreach (var sheetEl in workbook.Root?.Element(xMain + "sheets")?.Elements(xMain + "sheet") ?? Enumerable.Empty<XElement>())
    {
        string? sheetRid = (string?)sheetEl.Attribute(r + "id") ?? (string?)sheetEl.Attribute("r:id");
        if (sheetRid is null || !sheetPartById.TryGetValue(sheetRid, out string? sheetPart)) continue;
        var sheetEntry = Find(sheetPart);
        if (sheetEntry is null) continue;

        string sheetRelsPath = CombineRelsPath(sheetPart);
        var sheetRelsEntry = Find(sheetRelsPath);
        if (sheetRelsEntry is null) continue; // no relationships at all -> no drawing on this sheet
        XDocument sheetRels = Load(sheetRelsEntry);
        var drawingRel = sheetRels.Root?.Elements(rel + "Relationship")
            .FirstOrDefault(e => (string?)e.Attribute("Type") == "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing");
        if (drawingRel is null) continue;
        string drawingPart = ResolveTarget(sheetPart, (string)drawingRel.Attribute("Target")!);
        var drawingEntry = Find(drawingPart);
        if (drawingEntry is null) continue;
        XDocument drawing = Load(drawingEntry);

        string drawingRelsPath = CombineRelsPath(drawingPart);
        var drawingRelsEntry = Find(drawingRelsPath);
        var mediaTargetById = drawingRelsEntry is not null
            ? Load(drawingRelsEntry).Root?.Elements(rel + "Relationship")
                .ToDictionary(e => (string)e.Attribute("Id")!, e => ResolveTarget(drawingPart, (string)e.Attribute("Target")!))
              ?? new()
            : new();

        // Compound names on this sheet, in row order: a cell holding the
        // literal "Compound:" label, paired with the next cell in the same
        // row (observed layout: column A = label, column B = name).
        List<string> compoundNamesInOrder = FindCompoundLabels(Load(sheetEntry), xMain, sharedStrings);
        int compoundIdx = 0;

        var anchors = drawing.Root?.Elements()
            .Where(e => e.Name.LocalName is "oneCellAnchor" or "twoCellAnchor")
            .ToList() ?? new List<XElement>();

        foreach (var anchor in anchors)
        {
            var blipEl = anchor.Descendants().FirstOrDefault(e => e.Name.LocalName == "blip");
            string? embedId = (string?)blipEl?.Attribute(r + "embed");
            if (embedId is null || !mediaTargetById.TryGetValue(embedId, out string? mediaPart)) continue;
            var mediaEntry = Find(mediaPart);
            if (mediaEntry is null) continue;

            var extEl = anchor.Elements(xdr + "ext").FirstOrDefault();
            long cx = (long?)extEl?.Attribute("cx") ?? 0;
            long cy = (long?)extEl?.Attribute("cy") ?? 0;

            using var ms = new MemoryStream();
            using (var es = mediaEntry.Open()) es.CopyTo(ms);

            string? compoundName = compoundIdx < compoundNamesInOrder.Count ? compoundNamesInOrder[compoundIdx] : null;
            compoundIdx++;

            pictures.Add(new ExtractedPicture(ms.ToArray(), cx * cy, compoundName));
        }
    }

    return pictures;
}

static string[] LoadSharedStrings(ZipArchiveEntry? entry)
{
    if (entry is null) return Array.Empty<string>();
    XNamespace xMain = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    using var s = entry.Open();
    XDocument doc = XDocument.Load(s);
    return doc.Root?.Elements(xMain + "si")
        .Select(si => string.Concat(si.Descendants(xMain + "t").Select(t => t.Value)))
        .ToArray() ?? Array.Empty<string>();
}

// Finds every "Compound:" label cell and returns the adjacent cell's
// resolved string value, in row order. Cell values that reference the
// shared-string table (t="s") store an index into `sharedStrings`.
static List<string> FindCompoundLabels(XDocument sheet, XNamespace xMain, string[] sharedStrings)
{
    var results = new List<string>();
    string? CellString(XElement cell)
    {
        if ((string?)cell.Attribute("t") != "s") return null;
        var v = cell.Element(xMain + "v")?.Value;
        return v is not null && int.TryParse(v, out int idx) && idx >= 0 && idx < sharedStrings.Length ? sharedStrings[idx] : null;
    }

    foreach (var row in sheet.Root?.Element(xMain + "sheetData")?.Elements(xMain + "row") ?? Enumerable.Empty<XElement>())
    {
        var cells = row.Elements(xMain + "c").ToList();
        for (int i = 0; i < cells.Count - 1; i++)
        {
            if (CellString(cells[i])?.TrimEnd(':', ' ') == "Compound")
            {
                // Strip a trailing detector-channel tag like "(DAD1A)" -- it's
                // not part of the compound's identity, just clutter in a filename.
                string? name = CellString(cells[i + 1])?.Trim();
                if (name is not null)
                {
                    int paren = name.IndexOf('(');
                    if (paren > 0) name = name[..paren].Trim();
                }
                if (!string.IsNullOrWhiteSpace(name)) results.Add(name);
                break;
            }
        }
    }
    return results;
}

static string CombineRelsPath(string partPath)
{
    string dir = Path.GetDirectoryName(partPath)?.Replace('\\', '/') ?? "";
    string file = Path.GetFileName(partPath);
    return (dir.Length > 0 ? dir + "/" : "") + "_rels/" + file + ".rels";
}

static string ResolveTarget(string fromPart, string target)
{
    if (target.StartsWith('/')) return target.TrimStart('/');
    string dir = Path.GetDirectoryName(fromPart)?.Replace('\\', '/') ?? "";
    var combined = dir.Length > 0 ? dir + "/" + target : target;
    // Resolve "../" segments.
    var parts = new List<string>();
    foreach (var seg in combined.Split('/'))
    {
        if (seg == "..") { if (parts.Count > 0) parts.RemoveAt(parts.Count - 1); }
        else if (seg != ".") parts.Add(seg);
    }
    return string.Join('/', parts);
}

// Top-level statement files require every top-level statement/local
// function to precede any type declaration -- this has to be the last
// thing in the file, not sitting between two local functions.
sealed record ExtractedPicture(byte[] Bytes, long AreaEmu, string? CompoundName);
