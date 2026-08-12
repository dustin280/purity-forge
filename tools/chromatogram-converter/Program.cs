using System.IO.Compression;
using System.Threading;
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
    string baseName = Path.GetFileNameWithoutExtension(xlsxPath);
    string pngPath = Path.Combine(Path.GetDirectoryName(xlsxPath)!, baseName + ".chromatogram.png");

    try
    {
        if (!IsFileStable(xlsxPath))
        {
            log.Info($"Skipping '{Path.GetFileName(xlsxPath)}' — still being written, will retry next run.");
            skipped++;
            continue;
        }

        DateTime xlsxWritten = File.GetLastWriteTimeUtc(xlsxPath);
        if (File.Exists(pngPath) && File.GetLastWriteTimeUtc(pngPath) >= xlsxWritten)
        {
            skipped++; // already converted since the report last changed
            continue;
        }

        byte[]? mediaBytes = ExtractFirstMediaEntry(xlsxPath, log);
        if (mediaBytes is null)
        {
            log.Warn($"No embedded picture found in '{Path.GetFileName(xlsxPath)}' — skipping.");
            skipped++;
            continue;
        }

        byte[] pngBytes;
        switch (EmfConverter.Detect(mediaBytes))
        {
            case EmfConverter.ImageKind.Png:
                pngBytes = mediaBytes; // already a PNG — publish it through unchanged
                break;
            case EmfConverter.ImageKind.Emf:
                pngBytes = EmfConverter.EmfToPng(mediaBytes, config.TargetWidthPx);
                break;
            default:
                log.Warn($"Embedded picture in '{Path.GetFileName(xlsxPath)}' is neither PNG nor EMF — skipping.");
                skipped++;
                continue;
        }

        string tempPath = pngPath + ".tmp";
        File.WriteAllBytes(tempPath, pngBytes);
        File.Move(tempPath, pngPath, overwrite: true);
        log.Info($"Converted '{Path.GetFileName(xlsxPath)}' -> '{Path.GetFileName(pngPath)}' ({pngBytes.Length:N0} bytes).");
        converted++;
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

static byte[]? ExtractFirstMediaEntry(string xlsxPath, Logger log)
{
    using FileStream fs = File.Open(xlsxPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
    using ZipArchive zip = new(fs, ZipArchiveMode.Read);
    var mediaEntries = zip.Entries
        .Where(e => e.FullName.StartsWith("xl/media/", StringComparison.OrdinalIgnoreCase))
        .OrderBy(e => e.FullName)
        .ToList();
    if (mediaEntries.Count == 0) return null;
    if (mediaEntries.Count > 1)
        log.Warn($"'{Path.GetFileName(xlsxPath)}' has {mediaEntries.Count} embedded pictures — " +
                 $"using the first ('{mediaEntries[0].FullName}'). Multi-picture reports aren't handled yet.");

    using Stream entryStream = mediaEntries[0].Open();
    using MemoryStream ms = new();
    entryStream.CopyTo(ms);
    return ms.ToArray();
}
