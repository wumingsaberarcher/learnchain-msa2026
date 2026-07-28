using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public static class DatabaseMigrator
{
    public static void ApplyMigrations(AppDbContext context)
    {
        // Fresh Postgres (Render): EnsureCreated builds the full schema from the model.
        // SQLite (local/legacy): EnsureCreated + additive column patches for older files.
        context.Database.EnsureCreated();

        var provider = context.Database.ProviderName ?? "";
        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
            ApplySqliteLegacyPatches(context);
        else if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
            ApplyPostgresAdditivePatches(context);
    }

    private static void ApplySqliteLegacyPatches(AppDbContext context)
    {
        var connection = context.Database.GetDbConnection();
        connection.Open();

        try
        {
            EnsureSqliteColumn(connection, "Habits", "HabitType", "TEXT NOT NULL DEFAULT 'Daily'");
            EnsureSqliteColumn(connection, "Habits", "Difficulty", "INTEGER NOT NULL DEFAULT 1");
            EnsureSqliteColumn(connection, "Habits", "DueDate", "TEXT NULL");
            EnsureSqliteColumn(connection, "Habits", "IsCompleted", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "CheckIns", "MilestoneId", "INTEGER NULL");
            EnsureSqliteColumn(connection, "Users", "Email", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn(connection, "Users", "Bio", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn(connection, "Users", "DailyDigestEnabled", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "Users", "PasswordResetTokenHash", "TEXT NULL");
            EnsureSqliteColumn(connection, "Users", "PasswordResetExpiresAt", "TEXT NULL");
            EnsureSqliteColumn(connection, "Users", "Role", "TEXT NOT NULL DEFAULT 'User'");
            EnsureSqliteColumn(connection, "Users", "BannedUntil", "TEXT NULL");

            using var achievementCmd = connection.CreateCommand();
            achievementCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS UserAchievements (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    UserId INTEGER NOT NULL,
                    BadgeId TEXT NOT NULL,
                    UnlockedAt TEXT NOT NULL,
                    UNIQUE(UserId, BadgeId)
                );
                """;
            achievementCmd.ExecuteNonQuery();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE IF NOT EXISTS HabitMilestones (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    HabitId INTEGER NOT NULL,
                    Title TEXT NOT NULL,
                    DueDate TEXT NOT NULL,
                    XPValue INTEGER NOT NULL,
                    IsCompleted INTEGER NOT NULL DEFAULT 0,
                    SortOrder INTEGER NOT NULL DEFAULT 0
                );
                """;
            cmd.ExecuteNonQuery();
        }
        finally
        {
            connection.Close();
        }
    }

    /// <summary>
    /// Additive ALTER TABLE for Postgres if an older empty DB was created before model fields existed.
    /// Safe no-ops when columns already exist.
    /// </summary>
    private static void ApplyPostgresAdditivePatches(AppDbContext context)
    {
        var connection = context.Database.GetDbConnection();
        connection.Open();
        try
        {
            EnsurePostgresColumn(connection, "Users", "Bio", "text NOT NULL DEFAULT ''");
            EnsurePostgresColumn(connection, "Users", "DailyDigestEnabled", "boolean NOT NULL DEFAULT false");
            EnsurePostgresColumn(connection, "Users", "PasswordResetTokenHash", "text NULL");
            EnsurePostgresColumn(connection, "Users", "PasswordResetExpiresAt", "timestamp with time zone NULL");
            EnsurePostgresColumn(connection, "Users", "Email", "text NOT NULL DEFAULT ''");
            EnsurePostgresColumn(connection, "Users", "Role", "text NOT NULL DEFAULT 'User'");
            EnsurePostgresColumn(connection, "Users", "BannedUntil", "timestamp with time zone NULL");
            EnsurePostgresColumn(connection, "Habits", "HabitType", "text NOT NULL DEFAULT 'Daily'");
            EnsurePostgresColumn(connection, "Habits", "Difficulty", "integer NOT NULL DEFAULT 1");
            EnsurePostgresColumn(connection, "Habits", "DueDate", "timestamp with time zone NULL");
            EnsurePostgresColumn(connection, "Habits", "IsCompleted", "boolean NOT NULL DEFAULT false");
            EnsurePostgresColumn(connection, "CheckIns", "MilestoneId", "integer NULL");
        }
        finally
        {
            connection.Close();
        }
    }

    private static void EnsureSqliteColumn(System.Data.Common.DbConnection connection, string table, string column, string definition)
    {
        using var check = connection.CreateCommand();
        check.CommandText = $"PRAGMA table_info({table});";

        var exists = false;
        using (var reader = check.ExecuteReader())
        {
            while (reader.Read())
            {
                if (reader.GetString(1).Equals(column, StringComparison.OrdinalIgnoreCase))
                {
                    exists = true;
                    break;
                }
            }
        }

        if (!exists)
        {
            using var alter = connection.CreateCommand();
            alter.CommandText = $"ALTER TABLE {table} ADD COLUMN {column} {definition};";
            alter.ExecuteNonQuery();
        }
    }

    private static void EnsurePostgresColumn(System.Data.Common.DbConnection connection, string table, string column, string definition)
    {
        using var check = connection.CreateCommand();
        check.CommandText = """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND lower(table_name) = lower(@table)
              AND lower(column_name) = lower(@column)
            LIMIT 1;
            """;
        var pTable = check.CreateParameter();
        pTable.ParameterName = "table";
        pTable.Value = table;
        check.Parameters.Add(pTable);
        var pCol = check.CreateParameter();
        pCol.ParameterName = "column";
        pCol.Value = column;
        check.Parameters.Add(pCol);

        var exists = check.ExecuteScalar() != null;
        if (exists) return;

        using var alter = connection.CreateCommand();
        // Table/column names are controlled constants from this class, not user input.
        alter.CommandText = $"ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {definition};";
        try
        {
            alter.ExecuteNonQuery();
        }
        catch
        {
            // Table might use different casing from EnsureCreated; ignore if already present.
        }
    }
}
