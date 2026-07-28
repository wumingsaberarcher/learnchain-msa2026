using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

/// <summary>
/// Ensures a single Admin account exists from env vars (Admin:Username / Email / Password).
/// Only that bootstrap identity gets the Admin role — normal registration always creates Users.
/// </summary>
public static class AdminBootstrap
{
    public static async Task EnsureAdminAsync(IServiceProvider services, IConfiguration configuration, ILogger logger)
    {
        var username = configuration["Admin:Username"]?.Trim();
        var email = configuration["Admin:Email"]?.Trim();
        var password = configuration["Admin:Password"];

        if (string.IsNullOrWhiteSpace(username)
            || string.IsNullOrWhiteSpace(email)
            || string.IsNullOrWhiteSpace(password))
        {
            logger.LogInformation(
                "Admin bootstrap skipped — set Admin__Username, Admin__Email, Admin__Password to create your sole admin account.");
            return;
        }

        if (!AuthValidation.IsValidUsername(username)
            || !AuthValidation.IsValidEmail(email)
            || !AuthValidation.IsValidPassword(password))
        {
            logger.LogWarning("Admin bootstrap skipped — Admin__* values fail username/email/password rules.");
            return;
        }

        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var emailNorm = email.ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u =>
            u.Username == username || u.Email.ToLower() == emailNorm);

        if (user == null)
        {
            user = new User
            {
                Username = username,
                Email = emailNorm,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                Role = AppRoles.Admin,
                TotalXP = 0,
                Level = 1,
                CreatedAt = DateTime.UtcNow,
                BannedUntil = null
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            logger.LogInformation("Admin account created: {Username}", username);
            return;
        }

        // Keep this identity as the sole elevated account; refresh password from env if provided.
        user.Username = username;
        user.Email = emailNorm;
        user.Role = AppRoles.Admin;
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
        user.BannedUntil = null;

        // Demote any other accidental admins (only env bootstrap is authoritative).
        var others = await db.Users
            .Where(u => u.Id != user.Id && u.Role == AppRoles.Admin)
            .ToListAsync();
        foreach (var o in others)
            o.Role = AppRoles.User;

        await db.SaveChangesAsync();
        logger.LogInformation("Admin account synced: {Username}", username);
    }
}
