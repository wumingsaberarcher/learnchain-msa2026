using System.Security.Claims;
using backend.Controllers;
using backend.Data;
using backend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;

namespace backend.Tests;

public class CheckInControllerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly string _dbPath;
    private readonly AppDbContext _context;
    private readonly HabitController _habitController;
    private readonly CheckInController _checkInController;
    private readonly User _user;

    public CheckInControllerTests()
    {
        (_context, _connection, _dbPath) = TestDbFactory.CreateContext();
        _user = TestDbFactory.SeedUser(_context);
        _habitController = new HabitController(_context);
        _checkInController = new CheckInController(_context);
        SetAuthenticatedUser(_user.Id, _habitController);
        SetAuthenticatedUser(_user.Id, _checkInController);
    }

    private void SetAuthenticatedUser(int userId, ControllerBase controller)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, userId.ToString()) };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) }
        };
    }

    private async Task<Habit> CreateDailyHabit(string name, int difficulty = 1)
    {
        var result = await _habitController.CreateHabit(new CreateHabitRequest
        {
            Name = name,
            HabitType = "Daily",
            Difficulty = difficulty
        });
        return (Habit)((CreatedAtActionResult)result.Result!).Value!;
    }

    [Fact]
    public async Task CreateCheckIn_AwardsXpAndUpdatesUser()
    {
        var habit = await CreateDailyHabit("Study", difficulty: 3);

        var result = await _checkInController.CreateCheckIn(new CreateCheckInRequest { HabitId = habit.Id });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var checkIn = Assert.IsType<CheckIn>(created.Value);
        Assert.Equal(30, checkIn.XPEarned);

        var user = await _context.Users.FindAsync(_user.Id);
        Assert.Equal(30, user!.TotalXP);
        Assert.Equal(1, user.Level);
    }

    [Fact]
    public async Task CreateCheckIn_RejectsDuplicateCheckInSameDay()
    {
        var habit = await CreateDailyHabit("No Duplicate");

        await _checkInController.CreateCheckIn(new CreateCheckInRequest { HabitId = habit.Id });
        var result = await _checkInController.CreateCheckIn(new CreateCheckInRequest { HabitId = habit.Id });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Contains("已经打卡", badRequest.Value?.ToString());
    }

    [Fact]
    public async Task GetTodayCheckedHabitIds_ReturnsCheckedHabitsForToday()
    {
        var habit1 = await CreateDailyHabit("H1");
        var habit2 = await CreateDailyHabit("H2");

        await _checkInController.CreateCheckIn(new CreateCheckInRequest { HabitId = habit1.Id });

        var result = await _checkInController.GetTodayCheckedHabitIds();

        var ids = result.Value ?? Assert.IsAssignableFrom<IEnumerable<int>>(
            Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Single(ids);
        Assert.Contains(habit1.Id, ids);
        Assert.DoesNotContain(habit2.Id, ids);
    }

    [Fact]
    public async Task CreateCheckIn_RejectsInactiveOrForeignHabit()
    {
        var habit = await CreateDailyHabit("Will Delete");
        await _habitController.DeleteHabit(habit.Id);

        var result = await _checkInController.CreateCheckIn(new CreateCheckInRequest { HabitId = habit.Id });

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task CreateCheckIn_OneTimeHabit_CompletesAfterSingleCheckIn()
    {
        var created = await _habitController.CreateHabit(new CreateHabitRequest
        {
            Name = "Finish Report",
            HabitType = "OneTime",
            Difficulty = 2,
            DueDate = DateTime.UtcNow.Date.AddDays(7)
        });
        var habit = (Habit)((CreatedAtActionResult)created.Result!).Value!;

        var result = await _checkInController.CreateCheckIn(new CreateCheckInRequest { HabitId = habit.Id });

        Assert.IsType<CreatedAtActionResult>(result.Result);
        var updated = await _context.Habits.FindAsync(habit.Id);
        Assert.True(updated!.IsCompleted);

        var duplicate = await _checkInController.CreateCheckIn(new CreateCheckInRequest { HabitId = habit.Id });
        Assert.IsType<BadRequestObjectResult>(duplicate.Result);
    }

    [Fact]
    public async Task GetCheckIns_ReturnsOnlyCurrentUserRecords()
    {
        var habit = await CreateDailyHabit("My Checkins");
        await _checkInController.CreateCheckIn(new CreateCheckInRequest { HabitId = habit.Id });

        var otherUser = TestDbFactory.SeedUser(_context, "other2", "other2@test.com");
        var otherHabit = new Habit
        {
            UserId = otherUser.Id,
            Name = "Other",
            HabitType = "Daily",
            Frequency = "每日",
            Difficulty = 1,
            BaseXP = 10,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.Habits.Add(otherHabit);
        await _context.SaveChangesAsync();
        _context.CheckIns.Add(new CheckIn { HabitId = otherHabit.Id, UserId = otherUser.Id, XPEarned = 10, CompletedAt = DateTime.UtcNow });
        await _context.SaveChangesAsync();

        var result = await _checkInController.GetCheckIns(null);

        var checkIns = Assert.IsAssignableFrom<IEnumerable<CheckIn>>(result.Value);
        Assert.Single(checkIns);
        Assert.Equal(_user.Id, checkIns.First().UserId);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Close();
        _connection.Dispose();
        try { if (File.Exists(_dbPath)) File.Delete(_dbPath); } catch { /* ignore locked temp db */ }
    }
}
