using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

/// <summary>
/// Ensures a single SuperAdmin account from env vars (Admin:Username / Email / Password).
/// That identity is the ultimate owner (e.g. Cipher). Regular Admins granted in-app are preserved.
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
                "Admin bootstrap skipped — set Admin__Username, Admin__Email, Admin__Password to create your sole SuperAdmin account.");
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
                PasswordVault = password,
                Role = AppRoles.SuperAdmin,
                TotalXP = 0,
                Level = 1,
                CreatedAt = DateTime.UtcNow,
                BannedUntil = null
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            logger.LogInformation("SuperAdmin account created: {Username}", username);
            return;
        }

        // Keep this identity as the sole SuperAdmin; refresh password from env.
        user.Username = username;
        user.Email = emailNorm;
        user.Role = AppRoles.SuperAdmin;
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
        user.PasswordVault = password;
        user.BannedUntil = null;

        // Only one SuperAdmin — demote any other SuperAdmin to regular Admin (keep their staff access).
        var otherSupers = await db.Users
            .Where(u => u.Id != user.Id && u.Role == AppRoles.SuperAdmin)
            .ToListAsync();
        foreach (var o in otherSupers)
            o.Role = AppRoles.Admin;

        // Legacy: accounts still marked Admin that match nothing else stay Admin (granted in-app).
        // Migrate old sole-Admin bootstrap leftovers: if someone was Admin from previous bootstraps
        // and is NOT this identity, leave as Admin (do not wipe granted admins).

        await db.SaveChangesAsync();
        logger.LogInformation("SuperAdmin account synced: {Username}", username);
    }
}
