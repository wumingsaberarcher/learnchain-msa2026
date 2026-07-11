using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using backend.Controllers;
using backend.Data;
using backend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;

namespace backend.Tests;

public class HabitControllerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly string _dbPath;
    private readonly AppDbContext _context;
    private readonly HabitController _controller;
    private readonly User _user;

    public HabitControllerTests()
    {
        (_context, _connection, _dbPath) = TestDbFactory.CreateContext();
        _user = TestDbFactory.SeedUser(_context);
        _controller = new HabitController(_context);
        SetAuthenticatedUser(_user.Id);
    }

    private void SetAuthenticatedUser(int userId)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, userId.ToString()) };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) }
        };
    }

    [Fact]
    public async Task CreateHabit_ReturnsCreated_WithCorrectXpForDifficulty()
    {
        var request = new CreateHabitRequest
        {
            Name = "Morning Run",
            HabitType = "Daily",
            Difficulty = 2
        };

        var result = await _controller.CreateHabit(request);

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var habit = Assert.IsType<Habit>(created.Value);
        Assert.Equal("Morning Run", habit.Name);
        Assert.Equal(20, habit.BaseXP);
        Assert.Equal("Daily", habit.HabitType);
        Assert.True(habit.IsActive);
    }

    [Fact]
    public async Task CreateHabit_RejectsDuplicateActiveName()
    {
        await _controller.CreateHabit(new CreateHabitRequest { Name = "Read Books", HabitType = "Daily", Difficulty = 1 });

        var result = await _controller.CreateHabit(new CreateHabitRequest { Name = "read books", HabitType = "Daily", Difficulty = 1 });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Contains("同名", badRequest.Value?.ToString());
    }

    [Fact]
    public async Task CreateHabit_AllowsSameNameAfterSoftDelete()
    {
        var first = await _controller.CreateHabit(new CreateHabitRequest { Name = "Meditate", HabitType = "Daily", Difficulty = 1 });
        var habit = (Habit)((CreatedAtActionResult)first.Result!).Value!;

        await _controller.DeleteHabit(habit.Id);

        var second = await _controller.CreateHabit(new CreateHabitRequest { Name = "Meditate", HabitType = "Daily", Difficulty = 1 });

        Assert.IsType<CreatedAtActionResult>(second.Result);
    }

    [Fact]
    public async Task GetHabits_ReturnsOnlyActiveHabitsForCurrentUser()
    {
        await _controller.CreateHabit(new CreateHabitRequest { Name = "Active Habit", HabitType = "Daily", Difficulty = 1 });
        var inactive = await _controller.CreateHabit(new CreateHabitRequest { Name = "To Delete", HabitType = "Daily", Difficulty = 1 });
        var toDelete = (Habit)((CreatedAtActionResult)inactive.Result!).Value!;
        await _controller.DeleteHabit(toDelete.Id);

        var otherUser = TestDbFactory.SeedUser(_context, "other", "other@test.com");
        _context.Habits.Add(new Habit
        {
            UserId = otherUser.Id,
            Name = "Other User Habit",
            HabitType = "Daily",
            Frequency = "每日",
            Difficulty = 1,
            BaseXP = 10,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        });
        await _context.SaveChangesAsync();

        var result = await _controller.GetHabits();

        var habits = Assert.IsAssignableFrom<IEnumerable<Habit>>(result.Value);
        Assert.Single(habits);
        Assert.Equal("Active Habit", habits.First().Name);
        Assert.True(habits.First().IsDueToday);
    }

    [Fact]
    public async Task UpdateHabit_RejectsDuplicateName()
    {
        await _controller.CreateHabit(new CreateHabitRequest { Name = "Habit A", HabitType = "Daily", Difficulty = 1 });
        var second = await _controller.CreateHabit(new CreateHabitRequest { Name = "Habit B", HabitType = "Daily", Difficulty = 1 });
        var habitB = (Habit)((CreatedAtActionResult)second.Result!).Value!;

        var result = await _controller.UpdateHabit(habitB.Id, new Habit { Name = "habit a" });

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task DeleteHabit_SoftDeletesHabit()
    {
        var created = await _controller.CreateHabit(new CreateHabitRequest { Name = "Temp", HabitType = "Daily", Difficulty = 1 });
        var habit = (Habit)((CreatedAtActionResult)created.Result!).Value!;

        var result = await _controller.DeleteHabit(habit.Id);

        Assert.IsType<NoContentResult>(result);
        var deleted = await _context.Habits.FindAsync(habit.Id);
        Assert.NotNull(deleted);
        Assert.False(deleted!.IsActive);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Close();
        _connection.Dispose();
        try { if (File.Exists(_dbPath)) File.Delete(_dbPath); } catch { /* ignore locked temp db */ }
    }
}
