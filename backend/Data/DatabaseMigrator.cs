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
            EnsureSqliteColumn(connection, "Users", "PasswordVault", "TEXT NULL");
            EnsureSqliteColumn(connection, "Users", "CompanionAffection", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "Users", "CompanionAffectionDayUtc", "TEXT NULL");
            EnsureSqliteColumn(connection, "Users", "CompanionAffectionGainedToday", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "Users", "TrustLevel", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "Users", "TrustPoints", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "Users", "CurriculumInjectDayUtc", "TEXT NULL");
            EnsureSqliteColumn(connection, "Users", "CurriculumInjectCountToday", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "Users", "CurriculumStateJson", "TEXT NOT NULL DEFAULT '{\"injected\":[],\"completed\":[]}'");
            EnsureSqliteColumn(connection, "Users", "CanalEvaluation", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn(connection, "CanalKnowledgeEntries", "ExtractedText", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn(connection, "CanalKnowledgeEntries", "FileName", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn(connection, "CanalKnowledgeEntries", "ContentType", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn(connection, "CanalKnowledgeEntries", "FileSize", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "CanalKnowledgeEntries", "StoredPath", "TEXT NOT NULL DEFAULT ''");
            EnsureSqliteColumn(connection, "Habits", "AssessmentEnabled", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "Habits", "AssessmentDifficulty", "TEXT NOT NULL DEFAULT 'easy'");
            EnsureSqliteColumn(connection, "Habits", "GroupId", "INTEGER NULL");
            EnsureSqliteColumn(connection, "Habits", "Source", "TEXT NULL");
            EnsureSqliteColumn(connection, "Habits", "CurriculumLessonId", "TEXT NULL");
            EnsureSqliteColumn(connection, "ChatSessions", "ZoneType", "TEXT NOT NULL DEFAULT 'daily'");
            EnsureSqliteColumn(connection, "ChatSessions", "HabitId", "INTEGER NOT NULL DEFAULT 0");
            EnsureSqliteColumn(connection, "UserMemories", "ZoneType", "TEXT NOT NULL DEFAULT 'daily'");
            EnsureSqliteColumn(connection, "UserMemories", "HabitId", "INTEGER NOT NULL DEFAULT 0");

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

            using var materialsCmd = connection.CreateCommand();
            materialsCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS HabitMaterials (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    HabitId INTEGER NOT NULL,
                    UserId INTEGER NOT NULL,
                    FileName TEXT NOT NULL,
                    ContentType TEXT NOT NULL DEFAULT '',
                    Size INTEGER NOT NULL DEFAULT 0,
                    StoredPath TEXT NOT NULL DEFAULT '',
                    ExtractedText TEXT NOT NULL DEFAULT '',
                    CreatedAt TEXT NOT NULL
                );
                """;
            materialsCmd.ExecuteNonQuery();

            using var groupsCmd = connection.CreateCommand();
            groupsCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS HabitGroups (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    UserId INTEGER NOT NULL,
                    Name TEXT NOT NULL,
                    Description TEXT NULL,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    CreatedAt TEXT NOT NULL
                );
                """;
            groupsCmd.ExecuteNonQuery();

            using var groupMatsCmd = connection.CreateCommand();
            groupMatsCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS HabitGroupMaterials (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    GroupId INTEGER NOT NULL,
                    UserId INTEGER NOT NULL,
                    FileName TEXT NOT NULL,
                    ContentType TEXT NOT NULL DEFAULT '',
                    Size INTEGER NOT NULL DEFAULT 0,
                    StoredPath TEXT NOT NULL DEFAULT '',
                    ExtractedText TEXT NOT NULL DEFAULT '',
                    CreatedAt TEXT NOT NULL
                );
                """;
            groupMatsCmd.ExecuteNonQuery();

            using var canalKbCmd = connection.CreateCommand();
            canalKbCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS CanalKnowledgeEntries (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    EntryKey TEXT NOT NULL,
                    Category TEXT NOT NULL DEFAULT 'other',
                    TitleZh TEXT NOT NULL DEFAULT '',
                    TitleEn TEXT NOT NULL DEFAULT '',
                    BodyZh TEXT NOT NULL DEFAULT '',
                    BodyEn TEXT NOT NULL DEFAULT '',
                    ExtractedText TEXT NOT NULL DEFAULT '',
                    FileName TEXT NOT NULL DEFAULT '',
                    ContentType TEXT NOT NULL DEFAULT '',
                    FileSize INTEGER NOT NULL DEFAULT 0,
                    StoredPath TEXT NOT NULL DEFAULT '',
                    MinTrustLevel INTEGER NOT NULL DEFAULT 0,
                    Section TEXT NOT NULL DEFAULT '',
                    IsBuiltin INTEGER NOT NULL DEFAULT 0,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    SortOrder INTEGER NOT NULL DEFAULT 0,
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS IX_CanalKnowledgeEntries_EntryKey ON CanalKnowledgeEntries(EntryKey);
                """;
            canalKbCmd.ExecuteNonQuery();

            using var chatSessionCmd = connection.CreateCommand();
            chatSessionCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS ChatSessions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    UserId INTEGER NOT NULL,
                    Summary TEXT NOT NULL DEFAULT '',
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL
                );
                """;
            chatSessionCmd.ExecuteNonQuery();

            using var chatMsgCmd = connection.CreateCommand();
            chatMsgCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS ChatMessages (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    SessionId INTEGER NOT NULL,
                    Role TEXT NOT NULL,
                    Content TEXT NOT NULL,
                    TokenEstimate INTEGER NOT NULL DEFAULT 0,
                    IsArchived INTEGER NOT NULL DEFAULT 0,
                    CreatedAt TEXT NOT NULL
                );
                """;
            chatMsgCmd.ExecuteNonQuery();

            using var memoryCmd = connection.CreateCommand();
            memoryCmd.CommandText = """
                CREATE TABLE IF NOT EXISTS UserMemories (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    UserId INTEGER NOT NULL,
                    Type TEXT NOT NULL,
                    Key TEXT NOT NULL,
                    Content TEXT NOT NULL,
                    Importance INTEGER NOT NULL DEFAULT 3,
                    IsDeleted INTEGER NOT NULL DEFAULT 0,
                    LastAccessedAt TEXT NOT NULL,
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL
                );
                """;
            memoryCmd.ExecuteNonQuery();
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
            EnsurePostgresColumn(connection, "Users", "PasswordVault", "text NULL");
            EnsurePostgresColumn(connection, "Users", "CompanionAffection", "integer NOT NULL DEFAULT 0");
            EnsurePostgresColumn(connection, "Users", "CompanionAffectionDayUtc", "timestamp with time zone NULL");
            EnsurePostgresColumn(connection, "Users", "CompanionAffectionGainedToday", "integer NOT NULL DEFAULT 0");
            EnsurePostgresColumn(connection, "Users", "TrustLevel", "integer NOT NULL DEFAULT 0");
            EnsurePostgresColumn(connection, "Users", "TrustPoints", "integer NOT NULL DEFAULT 0");
            EnsurePostgresColumn(connection, "Users", "CurriculumInjectDayUtc", "timestamp with time zone NULL");
            EnsurePostgresColumn(connection, "Users", "CurriculumInjectCountToday", "integer NOT NULL DEFAULT 0");
            EnsurePostgresColumn(connection, "Users", "CurriculumStateJson", "text NOT NULL DEFAULT '{\"injected\":[],\"completed\":[]}'");
            EnsurePostgresColumn(connection, "Users", "CanalEvaluation", "text NOT NULL DEFAULT ''");
            EnsurePostgresColumn(connection, "CanalKnowledgeEntries", "ExtractedText", "text NOT NULL DEFAULT ''");
            EnsurePostgresColumn(connection, "CanalKnowledgeEntries", "FileName", "text NOT NULL DEFAULT ''");
            EnsurePostgresColumn(connection, "CanalKnowledgeEntries", "ContentType", "text NOT NULL DEFAULT ''");
            EnsurePostgresColumn(connection, "CanalKnowledgeEntries", "FileSize", "bigint NOT NULL DEFAULT 0");
            EnsurePostgresColumn(connection, "CanalKnowledgeEntries", "StoredPath", "text NOT NULL DEFAULT ''");
            EnsurePostgresColumn(connection, "Habits", "HabitType", "text NOT NULL DEFAULT 'Daily'");
            EnsurePostgresColumn(connection, "Habits", "Difficulty", "integer NOT NULL DEFAULT 1");
            EnsurePostgresColumn(connection, "Habits", "DueDate", "timestamp with time zone NULL");
            EnsurePostgresColumn(connection, "Habits", "IsCompleted", "boolean NOT NULL DEFAULT false");
            EnsurePostgresColumn(connection, "CheckIns", "MilestoneId", "integer NULL");
            EnsurePostgresColumn(connection, "Habits", "AssessmentEnabled", "boolean NOT NULL DEFAULT false");
            EnsurePostgresColumn(connection, "Habits", "AssessmentDifficulty", "text NOT NULL DEFAULT 'easy'");
            EnsurePostgresColumn(connection, "Habits", "GroupId", "integer NULL");
            EnsurePostgresColumn(connection, "Habits", "Source", "text NULL");
            EnsurePostgresColumn(connection, "Habits", "CurriculumLessonId", "text NULL");
            EnsurePostgresColumn(connection, "ChatSessions", "ZoneType", "text NOT NULL DEFAULT 'daily'");
            EnsurePostgresColumn(connection, "ChatSessions", "HabitId", "integer NOT NULL DEFAULT 0");
            EnsurePostgresColumn(connection, "UserMemories", "ZoneType", "text NOT NULL DEFAULT 'daily'");
            EnsurePostgresColumn(connection, "UserMemories", "HabitId", "integer NOT NULL DEFAULT 0");

            using (var materialsCmd = connection.CreateCommand())
            {
                materialsCmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS "HabitMaterials" (
                        "Id" serial PRIMARY KEY,
                        "HabitId" integer NOT NULL,
                        "UserId" integer NOT NULL,
                        "FileName" text NOT NULL,
                        "ContentType" text NOT NULL DEFAULT '',
                        "Size" bigint NOT NULL DEFAULT 0,
                        "StoredPath" text NOT NULL DEFAULT '',
                        "ExtractedText" text NOT NULL DEFAULT '',
                        "CreatedAt" timestamp with time zone NOT NULL
                    );
                    """;
                materialsCmd.ExecuteNonQuery();
            }

            using (var groupsCmd = connection.CreateCommand())
            {
                groupsCmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS "HabitGroups" (
                        "Id" serial PRIMARY KEY,
                        "UserId" integer NOT NULL,
                        "Name" text NOT NULL,
                        "Description" text NULL,
                        "IsActive" boolean NOT NULL DEFAULT true,
                        "CreatedAt" timestamp with time zone NOT NULL
                    );
                    """;
                groupsCmd.ExecuteNonQuery();
            }

            using (var groupMatsCmd = connection.CreateCommand())
            {
                groupMatsCmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS "HabitGroupMaterials" (
                        "Id" serial PRIMARY KEY,
                        "GroupId" integer NOT NULL,
                        "UserId" integer NOT NULL,
                        "FileName" text NOT NULL,
                        "ContentType" text NOT NULL DEFAULT '',
                        "Size" bigint NOT NULL DEFAULT 0,
                        "StoredPath" text NOT NULL DEFAULT '',
                        "ExtractedText" text NOT NULL DEFAULT '',
                        "CreatedAt" timestamp with time zone NOT NULL
                    );
                    """;
                groupMatsCmd.ExecuteNonQuery();
            }

            using (var canalKbCmd = connection.CreateCommand())
            {
                canalKbCmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS "CanalKnowledgeEntries" (
                        "Id" serial PRIMARY KEY,
                        "EntryKey" text NOT NULL,
                        "Category" text NOT NULL DEFAULT 'other',
                        "TitleZh" text NOT NULL DEFAULT '',
                        "TitleEn" text NOT NULL DEFAULT '',
                        "BodyZh" text NOT NULL DEFAULT '',
                        "BodyEn" text NOT NULL DEFAULT '',
                        "ExtractedText" text NOT NULL DEFAULT '',
                        "FileName" text NOT NULL DEFAULT '',
                        "ContentType" text NOT NULL DEFAULT '',
                        "FileSize" bigint NOT NULL DEFAULT 0,
                        "StoredPath" text NOT NULL DEFAULT '',
                        "MinTrustLevel" integer NOT NULL DEFAULT 0,
                        "Section" text NOT NULL DEFAULT '',
                        "IsBuiltin" boolean NOT NULL DEFAULT false,
                        "IsActive" boolean NOT NULL DEFAULT true,
                        "SortOrder" integer NOT NULL DEFAULT 0,
                        "CreatedAt" timestamp with time zone NOT NULL,
                        "UpdatedAt" timestamp with time zone NOT NULL
                    );
                    CREATE UNIQUE INDEX IF NOT EXISTS "IX_CanalKnowledgeEntries_EntryKey" ON "CanalKnowledgeEntries" ("EntryKey");
                    """;
                canalKbCmd.ExecuteNonQuery();
            }

            using (var chatSessionCmd = connection.CreateCommand())
            {
                chatSessionCmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS "ChatSessions" (
                        "Id" serial PRIMARY KEY,
                        "UserId" integer NOT NULL,
                        "Summary" text NOT NULL DEFAULT '',
                        "CreatedAt" timestamp with time zone NOT NULL,
                        "UpdatedAt" timestamp with time zone NOT NULL
                    );
                    """;
                chatSessionCmd.ExecuteNonQuery();
            }

            using (var chatMsgCmd = connection.CreateCommand())
            {
                chatMsgCmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS "ChatMessages" (
                        "Id" serial PRIMARY KEY,
                        "SessionId" integer NOT NULL,
                        "Role" text NOT NULL,
                        "Content" text NOT NULL,
                        "TokenEstimate" integer NOT NULL DEFAULT 0,
                        "IsArchived" boolean NOT NULL DEFAULT false,
                        "CreatedAt" timestamp with time zone NOT NULL
                    );
                    """;
                chatMsgCmd.ExecuteNonQuery();
            }

            using (var memoryCmd = connection.CreateCommand())
            {
                memoryCmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS "UserMemories" (
                        "Id" serial PRIMARY KEY,
                        "UserId" integer NOT NULL,
                        "Type" text NOT NULL,
                        "Key" text NOT NULL,
                        "Content" text NOT NULL,
                        "Importance" integer NOT NULL DEFAULT 3,
                        "IsDeleted" boolean NOT NULL DEFAULT false,
                        "LastAccessedAt" timestamp with time zone NOT NULL,
                        "CreatedAt" timestamp with time zone NOT NULL,
                        "UpdatedAt" timestamp with time zone NOT NULL
                    );
                    """;
                memoryCmd.ExecuteNonQuery();
            }
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
