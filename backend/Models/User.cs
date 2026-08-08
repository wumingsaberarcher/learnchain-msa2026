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

    /// <summary>Real Canal affection points (slow grind, per-user). Cap 3000.</summary>
    public int CompanionAffection { get; set; }

    /// <summary>UTC calendar day for CompanionAffectionGainedToday reset.</summary>
    public DateTime? CompanionAffectionDayUtc { get; set; }

    /// <summary>Points already gained today toward the daily affection cap.</summary>
    public int CompanionAffectionGainedToday { get; set; }

    /// <summary>
    /// Cached curriculum stage 0–4 derived from CompanionAffection tier (kept for legacy/admin).
    /// Source of truth for bond is CompanionAffection.
    /// </summary>
    public int TrustLevel { get; set; }

    /// <summary>Deprecated mirror — prefer CompanionAffection. Kept for migration compatibility.</summary>
    public int TrustPoints { get; set; }

    /// <summary>UTC day for CurriculumInjectCountToday.</summary>
    public DateTime? CurriculumInjectDayUtc { get; set; }

    /// <summary>Successful/attempted curriculum injects today (Stage 1 cap = 1).</summary>
    public int CurriculumInjectCountToday { get; set; }

    /// <summary>JSON: { "injected": string[], "completed": string[] } lesson ids.</summary>
    public string CurriculumStateJson { get; set; } = """{"injected":[],"completed":[]}""";

    /// <summary>One-line Canal evaluation of this user (admin-visible; regenerated from usage data).</summary>
    public string CanalEvaluation { get; set; } = string.Empty;
}
