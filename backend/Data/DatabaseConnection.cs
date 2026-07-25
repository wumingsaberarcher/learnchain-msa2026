namespace backend.Data;

public enum DatabaseProviderKind
{
    Sqlite,
    Postgres
}

public static class DatabaseConnection
{
    public static (string ConnectionString, DatabaseProviderKind Provider) Resolve(IConfiguration configuration)
    {
        // Prefer explicit connection string; Render also injects DATABASE_URL for linked Postgres.
        var raw = configuration.GetConnectionString("DefaultConnection")
            ?? configuration["DATABASE_URL"]
            ?? Environment.GetEnvironmentVariable("DATABASE_URL");

        raw = raw?.Trim().Trim('"', '\'');

        if (string.IsNullOrWhiteSpace(raw))
            return ("Data Source=learnchain.db", DatabaseProviderKind.Sqlite);

        if (IsPostgres(raw))
            return (NormalizePostgres(raw), DatabaseProviderKind.Postgres);

        // Legacy SQLite helpers for Render/Docker env quirks
        if (raw.Equals("Data", StringComparison.OrdinalIgnoreCase))
            return ("Data Source=/app/data/learnchain.db", DatabaseProviderKind.Sqlite);

        if (!raw.Contains('=') &&
            (raw.StartsWith('/') || raw.StartsWith("./") || raw.EndsWith(".db", StringComparison.OrdinalIgnoreCase)))
        {
            return ($"Data Source={raw}", DatabaseProviderKind.Sqlite);
        }

        return (raw, DatabaseProviderKind.Sqlite);
    }

    public static bool IsPostgres(string connectionString)
    {
        var s = connectionString.Trim();
        if (s.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            || s.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
            return true;

        if (s.Contains("Data Source=", StringComparison.OrdinalIgnoreCase)
            || s.Contains("DataSource=", StringComparison.OrdinalIgnoreCase))
            return false;

        return s.Contains("Host=", StringComparison.OrdinalIgnoreCase)
            || (s.Contains("Server=", StringComparison.OrdinalIgnoreCase)
                && s.Contains("Database=", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Convert Render-style postgres:// URLs into Npgsql key/value connection strings.
    /// </summary>
    public static string NormalizePostgres(string raw)
    {
        if (!raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return raw;
        }

        var uri = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':', 2);
        var username = Uri.UnescapeDataString(userInfo[0]);
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
        var database = uri.AbsolutePath.Trim('/');

        // Internal Render network usually works with Prefer; External needs SSL.
        var sslMode = uri.Host.Contains("render.com", StringComparison.OrdinalIgnoreCase)
            || uri.Host.StartsWith("dpg-", StringComparison.OrdinalIgnoreCase)
            ? "Prefer"
            : "Prefer";

        return $"Host={uri.Host};Port={(uri.Port > 0 ? uri.Port : 5432)};Database={database};Username={username};Password={password};SSL Mode={sslMode};Trust Server Certificate=true";
    }
}
