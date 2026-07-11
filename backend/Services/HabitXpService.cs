using backend.Models;

namespace backend.Services;

public static class HabitXpService
{
    public static int GetBaseXP(int difficulty) => difficulty switch
    {
        2 => 20,
        3 => 30,
        _ => 10
    };

    public static string GetFrequencyLabel(string habitType) => habitType switch
    {
        "EveryOtherDay" => "每两天",
        "Weekly" => "每周",
        "OneTime" => "一次性",
        _ => "每日"
    };

    public static int GetDefaultMilestoneXP(int difficulty, bool isFinal = false)
    {
        var baseXp = GetBaseXP(difficulty);
        return isFinal ? baseXp : Math.Max(5, (int)Math.Round(baseXp * 0.4));
    }
}

public static class HabitDueService
{
    public static bool IsDueToday(Habit habit, List<DateTime> checkInDates, List<HabitMilestone> milestones, DateTime today)
    {
        if (!habit.IsActive || habit.IsCompleted)
            return false;

        if (habit.HabitType == "OneTime")
        {
            if (milestones.Count > 0)
            {
                var pending = milestones.Where(m => !m.IsCompleted).ToList();
                if (pending.Count > 0)
                    return pending.Any(m => m.DueDate.Date <= today);

                return habit.DueDate.HasValue && habit.DueDate.Value.Date >= today;
            }

            return habit.DueDate.HasValue && habit.DueDate.Value.Date >= today;
        }

        if (checkInDates.Any(d => d == today))
            return false;

        var lastCheck = checkInDates.OrderByDescending(d => d).FirstOrDefault();

        return habit.HabitType switch
        {
            "EveryOtherDay" => lastCheck == default || (today - lastCheck).TotalDays >= 2,
            "Weekly" => lastCheck == default || (today - lastCheck).TotalDays >= 7,
            _ => true
        };
    }
}
