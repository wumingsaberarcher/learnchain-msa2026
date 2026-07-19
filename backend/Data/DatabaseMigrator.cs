using backend.Data;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public static class DatabaseMigrator
{
    public static void ApplyMigrations(AppDbContext context)
    {
        context.Database.EnsureCreated();

        var connection = context.Database.GetDbConnection();
        connection.Open();

        try
        {
            EnsureColumn(connection, "Habits", "HabitType", "TEXT NOT NULL DEFAULT 'Daily'");
            EnsureColumn(connection, "Habits", "Difficulty", "INTEGER NOT NULL DEFAULT 1");
            EnsureColumn(connection, "Habits", "DueDate", "TEXT NULL");
            EnsureColumn(connection, "Habits", "IsCompleted", "INTEGER NOT NULL DEFAULT 0");
            EnsureColumn(connection, "CheckIns", "MilestoneId", "INTEGER NULL");
            EnsureColumn(connection, "Users", "Email", "TEXT NOT NULL DEFAULT ''");

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

            EnsureColumn(connection, "Users", "Bio", "TEXT NOT NULL DEFAULT ''");
            EnsureColumn(connection, "Users", "DailyDigestEnabled", "INTEGER NOT NULL DEFAULT 0");

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

    private static void EnsureColumn(System.Data.Common.DbConnection connection, string table, string column, string definition)
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
}
