using backend.Models;
using backend.Services;

namespace backend.Tests;

public class HabitServiceTests
{
    [Theory]
    [InlineData(1, 10)]
    [InlineData(2, 20)]
    [InlineData(3, 30)]
    public void GetBaseXP_ReturnsExpectedValues(int difficulty, int expected)
    {
        Assert.Equal(expected, HabitXpService.GetBaseXP(difficulty));
    }

    [Fact]
    public void IsDueToday_DailyHabit_IsDueWhenNotCheckedToday()
    {
        var habit = new Habit { HabitType = "Daily", IsActive = true, IsCompleted = false };
        var today = DateTime.UtcNow.Date;

        Assert.True(HabitDueService.IsDueToday(habit, new List<DateTime>(), new List<HabitMilestone>(), today));
    }

    [Fact]
    public void IsDueToday_DailyHabit_NotDueWhenAlreadyCheckedToday()
    {
        var habit = new Habit { HabitType = "Daily", IsActive = true, IsCompleted = false };
        var today = DateTime.UtcNow.Date;

        Assert.False(HabitDueService.IsDueToday(habit, new List<DateTime> { today }, new List<HabitMilestone>(), today));
    }

    [Fact]
    public void IsDueToday_WeeklyHabit_NotDueWithinSevenDays()
    {
        var habit = new Habit { HabitType = "Weekly", IsActive = true, IsCompleted = false };
        var today = DateTime.UtcNow.Date;
        var lastCheck = today.AddDays(-3);

        Assert.False(HabitDueService.IsDueToday(habit, new List<DateTime> { lastCheck }, new List<HabitMilestone>(), today));
    }
}
