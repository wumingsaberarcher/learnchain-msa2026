using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public static class BadgeIds
{
    public const string FirstStep = "first_step";
    public const string IceBreaker = "ice_breaker";
    public const string AllRounder = "all_rounder";
    public const string SelfInvestor = "self_investor";
    public const string EarlyBird = "early_bird";
    public const string Phoenix = "phoenix";

    public const string Level5 = "level_5";
    public const string Level10 = "level_10";
    public const string Level20 = "level_20";
    public const string Level30 = "level_30";
    public const string Level50 = "level_50";
    public const string Level100 = "level_100";

    public const string Streak3 = "streak_3";
    public const string Streak7 = "streak_7";
    public const string Streak14 = "streak_14";
    public const string Streak30 = "streak_30";
    public const string Streak60 = "streak_60";
    public const string Streak100 = "streak_100";
    public const string Streak180 = "streak_180";
    public const string Streak365 = "streak_365";

    public const string Total10 = "total_10";
    public const string Total50 = "total_50";
    public const string Total100 = "total_100";
    public const string Total180 = "total_180";
    public const string Total365 = "total_365";
    public const string Total1000 = "total_1000";

    public static readonly string[] All =
    [
        FirstStep, IceBreaker, AllRounder, SelfInvestor, EarlyBird, Phoenix,
        Level5, Level10, Level20, Level30, Level50, Level100,
        Streak3, Streak7, Streak14, Streak30, Streak60, Streak100, Streak180, Streak365,
        Total10, Total50, Total100, Total180, Total365, Total1000
    ];
}

public class AchievementService
{
    private readonly AppDbContext _context;

    public AchievementService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<List<string>> EvaluateAndUnlockAsync(int userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null) return [];

        var existing = await _context.UserAchievements
            .Where(a => a.UserId == userId)
            .Select(a => a.BadgeId)
            .ToListAsync();

        var unlocked = new HashSet<string>(existing);
        var newlyUnlocked = new List<string>();

        var habits = await _context.Habits
            .Where(h => h.UserId == userId)
            .ToListAsync();

        var activeHabits = habits.Where(h => h.IsActive).ToList();
        var checkIns = await _context.CheckIns
            .Where(c => c.UserId == userId)
            .OrderBy(c => c.CompletedAt)
            .ToListAsync();

        var totalCheckIns = checkIns.Count;
        var maxStreak = await GetMaxCurrentStreakAsync(userId, activeHabits);
        var maxEverStreak = GetMaxEverStreak(checkIns);
        var hasOneTimeComplete = habits.Any(h => h.HabitType == "OneTime" && h.IsCompleted);

        TryUnlock(BadgeIds.FirstStep, activeHabits.Count >= 1, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.IceBreaker, hasOneTimeComplete, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.AllRounder, activeHabits.Count >= 5, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.SelfInvestor, user.TotalXP >= 1000, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.EarlyBird, HasEarlyBirdStreak(checkIns), unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Phoenix, HasPhoenixRecovery(checkIns), unlocked, newlyUnlocked);

        TryUnlock(BadgeIds.Level5, user.Level >= 5, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Level10, user.Level >= 10, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Level20, user.Level >= 20, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Level30, user.Level >= 30, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Level50, user.Level >= 50, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Level100, user.Level >= 100, unlocked, newlyUnlocked);

        TryUnlock(BadgeIds.Streak3, maxStreak >= 3, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Streak7, maxStreak >= 7, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Streak14, maxStreak >= 14, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Streak30, maxStreak >= 30, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Streak60, maxStreak >= 60, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Streak100, maxStreak >= 100, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Streak180, maxStreak >= 180, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Streak365, maxStreak >= 365, unlocked, newlyUnlocked);

        TryUnlock(BadgeIds.Total10, totalCheckIns >= 10, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Total50, totalCheckIns >= 50, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Total100, totalCheckIns >= 100, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Total180, totalCheckIns >= 180, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Total365, totalCheckIns >= 365, unlocked, newlyUnlocked);
        TryUnlock(BadgeIds.Total1000, totalCheckIns >= 1000, unlocked, newlyUnlocked);

        if (newlyUnlocked.Count > 0)
        {
            foreach (var badgeId in newlyUnlocked)
            {
                _context.UserAchievements.Add(new UserAchievement
                {
                    UserId = userId,
                    BadgeId = badgeId,
                    UnlockedAt = DateTime.UtcNow
                });
            }
            await _context.SaveChangesAsync();
        }

        return newlyUnlocked;
    }

    public async Task<List<object>> GetAchievementStatusAsync(int userId)
    {
        var unlocked = await _context.UserAchievements
            .Where(a => a.UserId == userId)
            .ToDictionaryAsync(a => a.BadgeId, a => a.UnlockedAt);

        return BadgeIds.All.Select(id => (object)new
        {
            badgeId = id,
            unlocked = unlocked.ContainsKey(id),
            unlockedAt = unlocked.TryGetValue(id, out var at) ? at : (DateTime?)null
        }).ToList();
    }

    private static void TryUnlock(string badgeId, bool condition, HashSet<string> unlocked, List<string> newlyUnlocked)
    {
        if (!condition || unlocked.Contains(badgeId)) return;
        unlocked.Add(badgeId);
        newlyUnlocked.Add(badgeId);
    }

    private async Task<int> GetMaxCurrentStreakAsync(int userId, List<Habit> activeHabits)
    {
        if (activeHabits.Count == 0) return 0;

        var today = DateTime.UtcNow.Date;
        var habitIds = activeHabits.Select(h => h.Id).ToList();
        var allCheckIns = await _context.CheckIns
            .Where(c => c.UserId == userId && habitIds.Contains(c.HabitId))
            .Select(c => new { c.HabitId, c.CompletedAt })
            .ToListAsync();

        var max = 0;
        foreach (var habit in activeHabits)
        {
            var dates = allCheckIns
                .Where(c => c.HabitId == habit.Id)
                .Select(c => c.CompletedAt.Date)
                .Distinct()
                .OrderByDescending(d => d)
                .ToList();

            var streak = 0;
            var current = today;
            foreach (var date in dates)
            {
                if (date == current) { streak++; current = current.AddDays(-1); }
                else if (date < current) break;
            }
            max = Math.Max(max, streak);
        }
        return max;
    }

    private static int GetMaxEverStreak(List<CheckIn> checkIns)
    {
        var dates = checkIns.Select(c => c.CompletedAt.Date).Distinct().OrderBy(d => d).ToList();
        if (dates.Count == 0) return 0;

        var max = 1;
        var current = 1;
        for (var i = 1; i < dates.Count; i++)
        {
            if (dates[i] == dates[i - 1].AddDays(1)) current++;
            else { max = Math.Max(max, current); current = 1; }
        }
        return Math.Max(max, current);
    }

    /// <summary>7 consecutive days with at least one check-in before 9:00 UTC.</summary>
    private static bool HasEarlyBirdStreak(List<CheckIn> checkIns)
    {
        var earlyDays = checkIns
            .Where(c => c.CompletedAt.Hour < 9)
            .Select(c => c.CompletedAt.Date)
            .Distinct()
            .OrderBy(d => d)
            .ToList();

        return LongestConsecutiveRun(earlyDays) >= 7;
    }

    /// <summary>Had a 2+ day gap, then rebuilt a 30-day consecutive check-in run.</summary>
    private static bool HasPhoenixRecovery(List<CheckIn> checkIns)
    {
        var dates = checkIns.Select(c => c.CompletedAt.Date).Distinct().OrderBy(d => d).ToList();
        if (dates.Count < 32) return false;

        var hadGap = false;
        for (var i = 1; i < dates.Count; i++)
        {
            if ((dates[i] - dates[i - 1]).Days >= 2) { hadGap = true; break; }
        }
        if (!hadGap) return false;

        return LongestConsecutiveRun(dates) >= 30;
    }

    private static int LongestConsecutiveRun(List<DateTime> sortedDates)
    {
        if (sortedDates.Count == 0) return 0;
        var max = 1;
        var current = 1;
        for (var i = 1; i < sortedDates.Count; i++)
        {
            if (sortedDates[i] == sortedDates[i - 1].AddDays(1)) current++;
            else { max = Math.Max(max, current); current = 1; }
        }
        return Math.Max(max, current);
    }
}
