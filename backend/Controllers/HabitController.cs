using backend.Data;
using backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HabitController : ControllerBase
{
    private readonly AppDbContext _context;

    public HabitController(AppDbContext context)
    {
        _context = context;
    }

    // GET: api/habit
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Habit>>> GetHabits()
    {
        var today = DateTime.UtcNow.Date;

        var habits = await _context.Habits.ToListAsync();

        // 查询今天已打卡的 HabitId
        var todayCheckedIds = await _context.CheckIns
            .Where(c => c.CompletedAt.Date == today)
            .Select(c => c.HabitId)
            .Distinct()
            .ToListAsync();

        foreach (var habit in habits)
        {
            habit.IsCheckedToday = todayCheckedIds.Contains(habit.Id);

            // 计算当前连击天数
            var checkInDates = await _context.CheckIns
                .Where(c => c.HabitId == habit.Id)
                .Select(c => c.CompletedAt.Date)
                .Distinct()
                .OrderByDescending(d => d)
                .ToListAsync();

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
        }

        return habits;
    }

    // GET: api/habit/5
    [HttpGet("{id}")]
    public async Task<ActionResult<Habit>> GetHabit(int id)
    {
        var habit = await _context.Habits.FindAsync(id);
        if (habit == null)
        {
            return NotFound();
        }

        // 单个习惯也计算连击（可选，但建议加上）
        var today = DateTime.UtcNow.Date;
        habit.IsCheckedToday = await _context.CheckIns
            .AnyAsync(c => c.HabitId == id && c.CompletedAt.Date == today);

        var checkInDates = await _context.CheckIns
            .Where(c => c.HabitId == id)
            .Select(c => c.CompletedAt.Date)
            .Distinct()
            .OrderByDescending(d => d)
            .ToListAsync();

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

        return habit;
    }

    // POST: api/habit
    [HttpPost]
    public async Task<ActionResult<Habit>> CreateHabit(Habit habit)
    {
        _context.Habits.Add(habit);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetHabit), new { id = habit.Id }, habit);
    }

    // PUT: api/habit/5
    [HttpPut("{id}")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> UpdateHabit(int id, [FromBody] Habit habit)
    {
        var existingHabit = await _context.Habits.FindAsync(id);
        if (existingHabit == null)
        {
            return NotFound();
        }

        if (!string.IsNullOrWhiteSpace(habit.Name))
        {
            existingHabit.Name = habit.Name.Trim();
        }

        await _context.SaveChangesAsync();
        return NoContent();
    }

    // DELETE: api/habit/5
    [HttpDelete("{id}")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> DeleteHabit(int id)
    {
        var habit = await _context.Habits.FindAsync(id);
        if (habit == null)
        {
            return NotFound();
        }

        _context.Habits.Remove(habit);
        await _context.SaveChangesAsync();
        return NoContent();
    }
}