using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HabitController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AchievementService _achievements;

    public HabitController(AppDbContext context, AchievementService achievements)
    {
        _context = context;
        _achievements = achievements;
    }

    private int GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null)
            throw new UnauthorizedAccessException("未登录或 Token 无效");

        return int.Parse(userIdClaim.Value);
    }

    private async Task EnrichHabitsAsync(List<Habit> habits, int currentUserId, DateTime today)
    {
        if (habits.Count == 0) return;

        var habitIds = habits.Select(h => h.Id).ToList();

        var todayCheckedIds = await _context.CheckIns
            .Where(c => c.UserId == currentUserId && c.CompletedAt.Date == today)
            .Select(c => c.HabitId)
            .Distinct()
            .ToListAsync();

        var allCheckIns = await _context.CheckIns
            .Where(c => c.UserId == currentUserId && habitIds.Contains(c.HabitId))
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

            var habitMilestones = milestones.Where(m => m.HabitId == habit.Id).ToList();
            habit.Milestones = habitMilestones;
            habit.IsDueToday = HabitDueService.IsDueToday(habit, checkInDates, habitMilestones, today);
        }
    }

    [HttpGet]
    [Authorize]
    public async Task<ActionResult<IEnumerable<Habit>>> GetHabits([FromQuery] bool includeInactive = false)
    {
        int currentUserId = GetCurrentUserId();
        var today = DateTime.UtcNow.Date;

        var query = _context.Habits.Where(h => h.UserId == currentUserId);

        if (!includeInactive)
            query = query.Where(h => h.IsActive);

        var habits = await query.ToListAsync();
        await EnrichHabitsAsync(habits, currentUserId, today);

        return habits;
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<Habit>> CreateHabit(CreateHabitRequest request)
    {
        int currentUserId = GetCurrentUserId();

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("习惯名称不能为空");

        var trimmedName = request.Name.Trim();
        bool nameExists = await _context.Habits.AnyAsync(h =>
            h.UserId == currentUserId &&
            h.IsActive &&
            h.Name.ToLower() == trimmedName.ToLower());

        if (nameExists)
            return BadRequest("已存在同名的活跃习惯，请使用不同的名称");

        var habitType = string.IsNullOrWhiteSpace(request.HabitType) ? "Daily" : request.HabitType;
        var difficulty = request.Difficulty is >= 1 and <= 3 ? request.Difficulty : 1;

        var habit = new Habit
        {
            UserId = currentUserId,
            Name = trimmedName,
            HabitType = habitType,
            Frequency = HabitXpService.GetFrequencyLabel(habitType),
            Difficulty = difficulty,
            BaseXP = HabitXpService.GetBaseXP(difficulty),
            DueDate = request.DueDate?.Date,
            CompletionType = habitType == "OneTime" ? 1 : 0,
            IsActive = true,
            IsCompleted = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.Habits.Add(habit);
        await _context.SaveChangesAsync();

        if (habitType == "OneTime" && request.Milestones != null && request.Milestones.Count > 0)
        {
            var milestones = request.Milestones
                .Select((m, index) => new HabitMilestone
                {
                    HabitId = habit.Id,
                    Title = string.IsNullOrWhiteSpace(m.Title) ? $"小目标 {index + 1}" : m.Title.Trim(),
                    DueDate = m.DueDate.Date,
                    XPValue = m.XPValue > 0 ? m.XPValue : HabitXpService.GetDefaultMilestoneXP(difficulty),
                    SortOrder = m.SortOrder > 0 ? m.SortOrder : index,
                    IsCompleted = false
                })
                .OrderBy(m => m.DueDate)
                .ToList();

            _context.HabitMilestones.AddRange(milestones);
            await _context.SaveChangesAsync();
        }

        await EnrichHabitsAsync(new List<Habit> { habit }, currentUserId, DateTime.UtcNow.Date);
        var newlyUnlocked = await _achievements.EvaluateAndUnlockAsync(currentUserId);
        return CreatedAtAction(nameof(GetHabits), new { id = habit.Id }, new { habit, newlyUnlocked });
    }

    [HttpPut("{id}")]
    [Authorize]
    public async Task<IActionResult> UpdateHabit(int id, [FromBody] Habit habit)
    {
        int currentUserId = GetCurrentUserId();

        var existingHabit = await _context.Habits
            .FirstOrDefaultAsync(h => h.Id == id && h.UserId == currentUserId);

        if (existingHabit == null)
            return NotFound("习惯不存在或无权限");

        if (!string.IsNullOrWhiteSpace(habit.Name))
        {
            var trimmedName = habit.Name.Trim();
            bool nameExists = await _context.Habits.AnyAsync(h =>
                h.UserId == currentUserId &&
                h.IsActive &&
                h.Id != id &&
                h.Name.ToLower() == trimmedName.ToLower());

            if (nameExists)
                return BadRequest("已存在同名的活跃习惯，请使用不同的名称");

            existingHabit.Name = trimmedName;
        }

        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    [Authorize]
    public async Task<IActionResult> DeleteHabit(int id)
    {
        int currentUserId = GetCurrentUserId();

        var habit = await _context.Habits
            .FirstOrDefaultAsync(h => h.Id == id && h.UserId == currentUserId);

        if (habit == null)
            return NotFound("习惯不存在或无权限");

        habit.IsActive = false;
        await _context.SaveChangesAsync();
        return NoContent();
    }
}
