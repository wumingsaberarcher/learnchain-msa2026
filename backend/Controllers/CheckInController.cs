using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace backend.Controllers;

public class CreateCheckInRequest
{
    public int HabitId { get; set; }
    public int? MilestoneId { get; set; }
    public string? Notes { get; set; }
}

[ApiController]
[Route("api/[controller]")]
public class CheckInController : ControllerBase
{
    private readonly AppDbContext _context;

    public CheckInController(AppDbContext context)
    {
        _context = context;
    }

    private int GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null)
            throw new UnauthorizedAccessException("未登录或 Token 无效");
        return int.Parse(userIdClaim.Value);
    }

    [HttpGet("today")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<int>>> GetTodayCheckedHabitIds()
    {
        int currentUserId = GetCurrentUserId();
        var today = DateTime.UtcNow.Date;

        var habitIds = await _context.CheckIns
            .Where(c => c.UserId == currentUserId && c.CompletedAt.Date == today)
            .Select(c => c.HabitId)
            .Distinct()
            .ToListAsync();

        return Ok(habitIds);
    }

    [HttpGet]
    [Authorize]
    public async Task<ActionResult<IEnumerable<CheckIn>>> GetCheckIns(int? habitId)
    {
        int currentUserId = GetCurrentUserId();
        var query = _context.CheckIns
            .Where(c => c.UserId == currentUserId)
            .AsQueryable();

        if (habitId.HasValue)
            query = query.Where(c => c.HabitId == habitId.Value);

        return await query.OrderByDescending(c => c.CompletedAt).ToListAsync();
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<CheckIn>> CreateCheckIn(CreateCheckInRequest request)
    {
        int currentUserId = GetCurrentUserId();
        var today = DateTime.UtcNow.Date;

        var habit = await _context.Habits
            .FirstOrDefaultAsync(h => h.Id == request.HabitId && h.UserId == currentUserId && h.IsActive);

        if (habit == null)
            return BadRequest("习惯不存在或无权限");

        if (habit.IsCompleted)
            return BadRequest("该一次性任务已完成");

        var checkInDates = await _context.CheckIns
            .Where(c => c.HabitId == habit.Id && c.UserId == currentUserId)
            .Select(c => c.CompletedAt.Date)
            .Distinct()
            .ToListAsync();

        var milestones = await _context.HabitMilestones
            .Where(m => m.HabitId == habit.Id)
            .OrderBy(m => m.SortOrder)
            .ToListAsync();

        int xpEarned;
        int? milestoneId = null;
        string? notes = request.Notes;

        if (request.MilestoneId.HasValue)
        {
            var milestone = milestones.FirstOrDefault(m => m.Id == request.MilestoneId.Value);
            if (milestone == null)
                return BadRequest("里程碑不存在");

            if (milestone.IsCompleted)
                return BadRequest("该小目标已完成");

            if (milestone.DueDate.Date > today)
                return BadRequest("该小目标尚未到打卡日期");

            bool milestoneCheckedToday = await _context.CheckIns
                .AnyAsync(c => c.UserId == currentUserId && c.MilestoneId == milestone.Id && c.CompletedAt.Date == today);

            if (milestoneCheckedToday)
                return BadRequest("今天已经打卡过该小目标");

            xpEarned = milestone.XPValue;
            milestoneId = milestone.Id;
            milestone.IsCompleted = true;
            notes = string.IsNullOrWhiteSpace(notes) ? $"完成小目标：{milestone.Title}" : notes;
        }
        else if (habit.HabitType == "OneTime")
        {
            if (milestones.Count > 0)
            {
                var pending = milestones.Where(m => !m.IsCompleted).ToList();
                if (pending.Count > 0)
                    return BadRequest("请先完成所有小目标后再进行最终打卡");

                bool finalCheckedToday = await _context.CheckIns
                    .AnyAsync(c => c.UserId == currentUserId && c.HabitId == habit.Id && c.MilestoneId == null && c.CompletedAt.Date == today);

                if (finalCheckedToday)
                    return BadRequest("今天已经完成最终打卡");

                xpEarned = HabitXpService.GetBaseXP(habit.Difficulty);
                habit.IsCompleted = true;
            }
            else
            {
                if (habit.DueDate.HasValue && habit.DueDate.Value.Date < today)
                    return BadRequest("该任务已超过截止日期");

                bool alreadyChecked = await _context.CheckIns
                    .AnyAsync(c => c.HabitId == habit.Id && c.UserId == currentUserId);

                if (alreadyChecked)
                    return BadRequest("该一次性任务已打卡");

                xpEarned = HabitXpService.GetBaseXP(habit.Difficulty);
                habit.IsCompleted = true;
            }
        }
        else
        {
            bool alreadyCheckedToday = checkInDates.Contains(today);
            if (alreadyCheckedToday)
                return BadRequest("今天已经打卡过了，不能重复打卡");

            if (!HabitDueService.IsDueToday(habit, checkInDates, milestones, today))
                return BadRequest("今天不是该习惯的打卡日");

            xpEarned = HabitXpService.GetBaseXP(habit.Difficulty);
        }

        var checkIn = new CheckIn
        {
            HabitId = habit.Id,
            UserId = currentUserId,
            MilestoneId = milestoneId,
            XPEarned = xpEarned,
            Notes = notes,
            CompletedAt = DateTime.UtcNow
        };

        _context.CheckIns.Add(checkIn);

        var user = await _context.Users.FindAsync(currentUserId);
        if (user != null)
        {
            user.TotalXP += xpEarned;
            user.Level = (user.TotalXP / 100) + 1;
        }

        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetCheckIns), new { habitId = checkIn.HabitId }, checkIn);
    }
}
