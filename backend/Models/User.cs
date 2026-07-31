namespace backend.Models;

public static class AppRoles
{
    public const string User = "User";
    /// <summary>Regular admin — user management, XP, badges, ban/delete (not SuperAdmin).</summary>
    public const string Admin = "Admin";
    /// <summary>Ultimate admin (env bootstrap, e.g. Cipher) — can grant Admin + view vault secrets.</summary>
    public const string SuperAdmin = "SuperAdmin";

    public static bool IsStaff(string? role) =>
        role == Admin || role == SuperAdmin;

    public static bool IsSuperAdmin(string? role) =>
        role == SuperAdmin;

    /// <summary>Protected from regular Admin actions (XP/ban/delete).</summary>
    public static bool IsProtectedStaff(string? role) =>
        role == Admin || role == SuperAdmin;
}

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public int TotalXP { get; set; } = 0;
    public int Level { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>Personal bio / self-motivation notes (newline-separated).</summary>
    public string Bio { get; set; } = string.Empty;

    /// <summary>When true, DailyDigestHostedService emails a today-task summary.</summary>
    public bool DailyDigestEnabled { get; set; }

    /// <summary>SHA-256 hex of the 6-digit password-reset code.</summary>
    public string? PasswordResetTokenHash { get; set; }

    public DateTime? PasswordResetExpiresAt { get; set; }

    /// <summary>RBAC: User | Admin | SuperAdmin.</summary>
    public string Role { get; set; } = AppRoles.User;

    /// <summary>
    /// Password vault for SuperAdmin inspection only (synced on register/change/reset).
    /// Login still verifies against PasswordHash (BCrypt). Never return via /me or regular Admin APIs.
    /// </summary>
    public string? PasswordVault { get; set; }

    /// <summary>When set and in the future, the account cannot log in or use the API.</summary>
    public DateTime? BannedUntil { get; set; }

    public bool IsBanned => BannedUntil.HasValue && BannedUntil.Value > DateTime.UtcNow;
}
