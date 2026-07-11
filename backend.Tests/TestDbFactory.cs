using backend.Data;
using backend.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace backend.Tests;

public static class TestDbFactory
{
    public static (AppDbContext Context, SqliteConnection Connection, string DbPath) CreateContext()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"learnchain-test-{Guid.NewGuid():N}.db");
        var connection = new SqliteConnection($"Data Source={dbPath}");
        connection.Open();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connection)
            .Options;

        var context = new AppDbContext(options);
        DatabaseMigrator.ApplyMigrations(context);
        return (context, connection, dbPath);
    }

    public static User SeedUser(AppDbContext context, string username = "testuser", string email = "test@example.com")
    {
        var user = new User
        {
            Username = username,
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("password123"),
            TotalXP = 0,
            Level = 1,
            CreatedAt = DateTime.UtcNow
        };
        context.Users.Add(user);
        context.SaveChanges();
        return user;
    }
}
