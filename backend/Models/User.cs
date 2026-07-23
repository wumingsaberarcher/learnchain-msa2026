namespace backend.Models;

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
}