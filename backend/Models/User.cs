namespace backend.Models;

public static class AppRoles
{
    public const string User = "User";
    public const string Admin = "Admin";
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

    /// <summary>RBAC role: User (default) or Admin.</summary>
    public string Role { get; set; } = AppRoles.User;

    /// <summary>When set and in the future, the account cannot log in or use the API.</summary>
    public DateTime? BannedUntil { get; set; }

    public bool IsBanned => BannedUntil.HasValue && BannedUntil.Value > DateTime.UtcNow;
}
