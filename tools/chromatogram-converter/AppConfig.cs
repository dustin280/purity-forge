using System.Text.Json;

namespace ChromatogramConverter;

public sealed class AppConfig
{
    public string WatchFolder { get; set; } = "";
    public string LogFile { get; set; } = "converter.log";
    public int TargetWidthPx { get; set; } = 900;

    public static AppConfig Load(string path, string? watchFolderOverride)
    {
        AppConfig config = new();
        if (File.Exists(path))
        {
            string json = File.ReadAllText(path);
            AppConfig? loaded = JsonSerializer.Deserialize<AppConfig>(
                json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (loaded is not null) config = loaded;
        }
        if (!string.IsNullOrWhiteSpace(watchFolderOverride))
            config.WatchFolder = watchFolderOverride;
        return config;
    }
}
