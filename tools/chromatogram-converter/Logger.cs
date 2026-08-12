namespace ChromatogramConverter;

public sealed class Logger
{
    private readonly string _logFile;

    public Logger(string logFile) => _logFile = logFile;

    public void Info(string message) => Write("INFO", message);
    public void Warn(string message) => Write("WARN", message);
    public void Error(string message) => Write("ERROR", message);

    private void Write(string level, string message)
    {
        string line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{level}] {message}";
        Console.WriteLine(line);
        try
        {
            string? dir = Path.GetDirectoryName(_logFile);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.AppendAllText(_logFile, line + Environment.NewLine);
        }
        catch
        {
            // Logging must never take down a run — the console line above
            // is the fallback if the log file can't be written to.
        }
    }
}
