using backend.Data;
using backend.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CheckInController : ControllerBase
{
    private readonly AppDbContext _context;

    public CheckInController(AppDbContext context)
    {
        _context = context;
    }

    // GET: api/checkin?habitId=1
    [HttpGet]
    public async Task<ActionResult<IEnumerable<CheckIn>>> GetCheckIns(int? habitId)
    {
        var query = _context.CheckIns.AsQueryable();

        if (habitId.HasValue)
        {
            query = query.Where(c => c.HabitId == habitId.Value);
        }

        return await query.OrderByDescending(c => c.CompletedAt).ToListAsync();
    }

    // GET: api/checkin/today
    [HttpGet("today")]
    public async Task<ActionResult<IEnumerable<int>>> GetTodayCheckedHabitIds()
    {
        var today = DateTime.UtcNow.Date;

        var habitIds = await _context.CheckIns
            .Where(c => c.CompletedAt.Date == today)
            .Select(c => c.HabitId)
            .Distinct()
            .ToListAsync();

        return Ok(habitIds);
    }

    // POST: api/checkin
    [HttpPost]
    [Microsoft.AspNetCore.Authorization.Authorize]   // 需要登录才能打卡
    public async Task<ActionResult<CheckIn>> CreateCheckIn(CheckIn checkIn)
    {
        // 1. 获取当前登录用户的 ID（从 JWT Token 中解析）
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim == null)
        {
            return Unauthorized("未登录或 Token 无效");
        }

        int currentUserId = int.Parse(userIdClaim.Value);

        // 2. 检查 Habit 是否存在
        var habit = await _context.Habits.FindAsync(checkIn.HabitId);
        if (habit == null)
        {
            return BadRequest("Habit not found");
        }

        // 3. 防止同一天重复打卡
        var today = DateTime.UtcNow.Date;
        bool alreadyCheckedToday = await _context.CheckIns
            .AnyAsync(c => c.HabitId == checkIn.HabitId && c.CompletedAt.Date == today);

        if (alreadyCheckedToday)
        {
            return BadRequest("今天已经打卡过了，不能重复打卡");
        }

        // 4. 设置打卡信息
        checkIn.UserId = currentUserId;           // 强制使用当前登录用户
        checkIn.XPEarned = habit.BaseXP;
        checkIn.CompletedAt = DateTime.UtcNow;

        _context.CheckIns.Add(checkIn);

        // 5. 把 XP 累加到用户身上（核心！）
        var user = await _context.Users.FindAsync(currentUserId);
        if (user != null)
        {
            user.TotalXP += checkIn.XPEarned;

            // 简单计算等级（每 100 XP 升 1 级，可后续优化）
            user.Level = (user.TotalXP / 100) + 1;
        }

        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetCheckIns), new { habitId = checkIn.HabitId }, checkIn);
    }

    // DELETE: api/checkin/5
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCheckIn(int id)
    {
        var checkIn = await _context.CheckIns.FindAsync(id);
        if (checkIn == null)
        {
            return NotFound();
        }

        _context.CheckIns.Remove(checkIn);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}