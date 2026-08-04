using backend.Data;
using backend.Models;

namespace backend.Services;

public record AffectionSnapshot(
    int Points,
    int MaxPoints,
    int Tier,
    string TierKey,
    int GainedToday,
    int DailyCap,
    int ToNextTier);

public record AffectionAwardResult(
    int Awarded,
    int Points,
    int MaxPoints,
    int Tier,
    string TierKey,
    int GainedToday,
    int DailyCap);

/// <summary>
/// Slow per-user Canal bond. Isolated on User row (CompanionAffection*).
/// Roughly months of daily play to reach the top tier.
/// </summary>
public class CompanionAffectionService
{
    public const int MaxPoints = 3000;
    public const int DailyCap = 20;
    public const int CheckInGain = 3;
    public const int FocusCheckInGain = 6;
    public const int ChatGain = 1;

    private readonly AppDbContext _db;

    public CompanionAffectionService(AppDbContext db)
    {
        _db = db;
    }

    public static AffectionSnapshot Snapshot(User user)
    {
        EnsureDay(user);
        var points = Math.Clamp(user.CompanionAffection, 0, MaxPoints);
        var (tier, key, nextAt) = ResolveTier(points);
        return new AffectionSnapshot(
            points,
            MaxPoints,
            tier,
            key,
            user.CompanionAffectionGainedToday,
            DailyCap,
            Math.Max(0, nextAt - points));
    }

    public async Task<AffectionAwardResult> AwardCheckInAsync(User user, bool fromFocusMode, CancellationToken ct = default)
    {
        var want = fromFocusMode ? FocusCheckInGain : CheckInGain;
        return await AwardAsync(user, want, ct);
    }

    public async Task<AffectionAwardResult> AwardChatAsync(User user, CancellationToken ct = default)
    {
        // Small bump; DailyCap still applies so chat spam cannot rush the bond.
        return await AwardAsync(user, ChatGain, ct);
    }

    private async Task<AffectionAwardResult> AwardAsync(User user, int want, CancellationToken ct)
    {
        EnsureDay(user);
        if (want <= 0 || user.CompanionAffection >= MaxPoints)
            return Result(user, 0);

        var roomDaily = Math.Max(0, DailyCap - user.CompanionAffectionGainedToday);
        var roomMax = Math.Max(0, MaxPoints - user.CompanionAffection);
        var award = Math.Min(want, Math.Min(roomDaily, roomMax));
        if (award <= 0)
            return Result(user, 0);

        user.CompanionAffection += award;
        user.CompanionAffectionGainedToday += award;
        await _db.SaveChangesAsync(ct);
        return Result(user, award);
    }

    private static AffectionAwardResult Result(User user, int awarded)
    {
        var snap = Snapshot(user);
        return new AffectionAwardResult(
            awarded,
            snap.Points,
            snap.MaxPoints,
            snap.Tier,
            snap.TierKey,
            snap.GainedToday,
            snap.DailyCap);
    }

    private static void EnsureDay(User user)
    {
        var today = DateTime.UtcNow.Date;
        if (user.CompanionAffectionDayUtc is null || user.CompanionAffectionDayUtc.Value.Date != today)
        {
            user.CompanionAffectionDayUtc = today;
            user.CompanionAffectionGainedToday = 0;
        }
    }

    /// <summary>Tier thresholds — slow climb.</summary>
    public static (int Tier, string Key, int NextThreshold) ResolveTier(int points)
    {
        // nextThreshold is the first point of the *next* tier (or Max+1 at top)
        if (points >= 3000) return (5, "heart", 3001);
        if (points >= 2000) return (4, "bond", 3000);
        if (points >= 1000) return (3, "trust", 2000);
        if (points >= 400) return (2, "friend", 1000);
        if (points >= 100) return (1, "familiar", 400);
        return (0, "stranger", 100);
    }
}
