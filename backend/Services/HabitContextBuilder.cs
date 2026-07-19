using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Text.Json;

namespace backend.Services;

/// <summary>Builds habit / check-in / account context for the AI assistant.</summary>
public class HabitContextBuilder
{
    private readonly AppDbContext _context;

    public HabitContextBuilder(AppDbContext context)
    {
        _context = context;
    }

    public async Task EnrichHabitsAsync(List<Habit> habits, int userId, DateTime today)
    {
        if (habits.Count == 0) return;

        var habitIds = habits.Select(h => h.Id).ToList();

        var todayCheckedIds = await _context.CheckIns
            .Where(c => c.UserId == userId && c.CompletedAt.Date == today)
            .Select(c => c.HabitId)
            .Distinct()
            .ToListAsync();

        var allCheckIns = await _context.CheckIns
            .Where(c => c.UserId == userId && habitIds.Contains(c.HabitId))
            .Select(c => new { c.HabitId, c.CompletedAt })
            .ToListAsync();

        var milestones = await _context.HabitMilestones
            .Where(m => habitIds.Contains(m.HabitId))
            .OrderBy(m => m.SortOrder)
            .ToListAsync();

        foreach (var habit in habits)
        {
            if (string.IsNullOrWhiteSpace(habit.HabitType))
                habit.HabitType = "Daily";

            habit.IsCheckedToday = todayCheckedIds.Contains(habit.Id);

            var checkInDates = allCheckIns
                .Where(c => c.HabitId == habit.Id)
                .Select(c => c.CompletedAt.Date)
                .Distinct()
                .OrderByDescending(d => d)
                .ToList();

            int streak = 0;
            var currentDate = today;
            foreach (var date in checkInDates)
            {
                if (date == currentDate)
                {
                    streak++;
                    currentDate = currentDate.AddDays(-1);
                }
                else if (date < currentDate)
                {
                    break;
                }
            }

            habit.CurrentStreak = streak;
            habit.Milestones = milestones.Where(m => m.HabitId == habit.Id).ToList();
            habit.IsDueToday = HabitDueService.IsDueToday(habit, checkInDates, habit.Milestones, today);
        }
    }

    public async Task<List<Habit>> GetActiveHabitsAsync(int userId)
    {
        var today = DateTime.UtcNow.Date;
        var habits = await _context.Habits
            .Where(h => h.UserId == userId && h.IsActive)
            .OrderBy(h => h.Name)
            .ToListAsync();
        await EnrichHabitsAsync(habits, userId, today);
        return habits;
    }

    public async Task<string> BuildContextJsonAsync(User user)
    {
        var habits = await GetActiveHabitsAsync(user.Id);
        var pending = habits.Where(h => h.IsDueToday && !h.IsCheckedToday).ToList();
        var done = habits.Where(h => h.IsDueToday && h.IsCheckedToday).ToList();
        var notDue = habits.Where(h => !h.IsDueToday).ToList();

        var payload = new
        {
            account = new
            {
                user.Id,
                user.Username,
                user.Email,
                user.Level,
                user.TotalXP,
                user.Bio,
                user.CreatedAt,
                user.DailyDigestEnabled
            },
            todayUtc = DateTime.UtcNow.Date.ToString("yyyy-MM-dd"),
            summary = new
            {
                activeHabits = habits.Count,
                dueToday = pending.Count + done.Count,
                pendingCount = pending.Count,
                completedTodayCount = done.Count
            },
            pendingToday = pending.Select(SummarizeHabit),
            completedToday = done.Select(SummarizeHabit),
            notDueToday = notDue.Select(SummarizeHabit),
            capabilities = new[]
            {
                "Answer questions about the user's account, habits, streaks, XP, and what is due today",
                "Guide the user step-by-step to create a new habit (Daily / EveryOtherDay / Weekly / OneTime)",
                "Rename an existing habit",
                "Soft-delete (deactivate) a habit",
                "Send a today-task reminder email to the user's registered email",
                "Cannot change habit type/difficulty via update (create new or rename only); cannot check in for the user"
            }
        };

        return JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false });
    }

    public string BuildTodayPlainText(List<Habit> habits, bool zh)
    {
        var sb = new StringBuilder();
        var pending = habits.Where(h => h.IsDueToday && !h.IsCheckedToday).ToList();
        var done = habits.Where(h => h.IsDueToday && h.IsCheckedToday).ToList();

        if (zh)
        {
            sb.AppendLine($"今日待打卡 ({pending.Count}):");
            if (pending.Count == 0) sb.AppendLine("- 无");
            else foreach (var h in pending) sb.AppendLine($"- [{h.Id}] {h.Name} ({h.HabitType}, 连击 {h.CurrentStreak})");

            sb.AppendLine($"今日已完成 ({done.Count}):");
            if (done.Count == 0) sb.AppendLine("- 无");
            else foreach (var h in done) sb.AppendLine($"- [{h.Id}] {h.Name}");
        }
        else
        {
            sb.AppendLine($"Pending today ({pending.Count}):");
            if (pending.Count == 0) sb.AppendLine("- none");
            else foreach (var h in pending) sb.AppendLine($"- [{h.Id}] {h.Name} ({h.HabitType}, streak {h.CurrentStreak})");

            sb.AppendLine($"Done today ({done.Count}):");
            if (done.Count == 0) sb.AppendLine("- none");
            else foreach (var h in done) sb.AppendLine($"- [{h.Id}] {h.Name}");
        }

        return sb.ToString().TrimEnd();
    }

    private static object SummarizeHabit(Habit h) => new
    {
        h.Id,
        h.Name,
        h.HabitType,
        h.Difficulty,
        h.BaseXP,
        h.CurrentStreak,
        h.IsDueToday,
        h.IsCheckedToday,
        h.DueDate,
        milestoneCount = h.Milestones?.Count ?? 0
    };
}
