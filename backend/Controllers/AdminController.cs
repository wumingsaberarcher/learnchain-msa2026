using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = AppRoles.Admin)]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AchievementService _achievements;

    public AdminController(AppDbContext context, AchievementService achievements)
    {
        _context = context;
        _achievements = achievements;
    }

    [HttpGet("users")]
    public async Task<ActionResult<object>> ListUsers([FromQuery] string? q = null)
    {
        var query = _context.Users.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            query = query.Where(u =>
                u.Username.ToLower().Contains(term) || u.Email.ToLower().Contains(term));
        }

        var users = await query.OrderByDescending(u => u.CreatedAt).ToListAsync();
        var ids = users.Select(u => u.Id).ToList();

        var habitCounts = await _context.Habits
            .Where(h => ids.Contains(h.UserId) && h.IsActive)
            .GroupBy(h => h.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);

        var badgeCounts = await _context.UserAchievements
            .Where(a => ids.Contains(a.UserId))
            .GroupBy(a => a.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);

        var result = users.Select(u => new
        {
            u.Id,
            u.Username,
            u.Email,
            u.TotalXP,
            u.Level,
            u.Role,
            u.CreatedAt,
            u.BannedUntil,
            isBanned = u.IsBanned,
            habitCount = habitCounts.GetValueOrDefault(u.Id),
            badgeCount = badgeCounts.GetValueOrDefault(u.Id)
        });

        return Ok(result);
    }

    [HttpGet("users/{id:int}")]
    public async Task<ActionResult<object>> GetUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");

        var achievements = await _achievements.GetAchievementStatusAsync(id);
        return Ok(new
        {
            user.Id,
            user.Username,
            user.Email,
            user.TotalXP,
            user.Level,
            user.Role,
            user.Bio,
            user.CreatedAt,
            user.BannedUntil,
            isBanned = user.IsBanned,
            achievements
        });
    }

    [HttpPut("users/{id:int}/xp")]
    public async Task<IActionResult> SetXp(int id, [FromBody] AdminSetXpDto dto)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");
        if (user.Role == AppRoles.Admin)
            return BadRequest("不能修改管理员的经验值");

        if (dto.TotalXP < 0)
            return BadRequest("TotalXP 不能为负");

        user.TotalXP = dto.TotalXP;
        user.Level = (user.TotalXP / 100) + 1;
        await _context.SaveChangesAsync();

        var newlyUnlocked = await _achievements.EvaluateAndUnlockAsync(user.Id);
        return Ok(new
        {
            message = "经验已更新",
            user.Id,
            user.TotalXP,
            user.Level,
            newlyUnlocked
        });
    }

    [HttpPost("users/{id:int}/badges")]
    public async Task<IActionResult> GrantBadge(int id, [FromBody] AdminBadgeDto dto)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");

        var badgeId = dto.BadgeId?.Trim() ?? "";
        if (!BadgeIds.All.Contains(badgeId))
            return BadRequest("无效的 badgeId");

        var ok = await _achievements.GrantBadgeAsync(id, badgeId);
        if (!ok)
            return BadRequest("该徽章已拥有或发放失败");

        return Ok(new { message = "徽章已发放", badgeId });
    }

    [HttpDelete("users/{id:int}/badges/{badgeId}")]
    public async Task<IActionResult> RevokeBadge(int id, string badgeId)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");

        var removed = await _achievements.RevokeBadgeAsync(id, badgeId);
        if (!removed)
            return NotFound("用户未拥有该徽章");

        return Ok(new { message = "徽章已收回", badgeId });
    }

    [HttpPost("users/{id:int}/ban")]
    public async Task<IActionResult> BanUser(int id, [FromBody] AdminBanDto dto)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");
        if (user.Role == AppRoles.Admin)
            return BadRequest("不能封禁管理员账号");

        DateTime until;
        if (dto.Until.HasValue)
            until = DateTime.SpecifyKind(dto.Until.Value.ToUniversalTime(), DateTimeKind.Utc);
        else if (dto.Days is > 0)
            until = DateTime.UtcNow.AddDays(dto.Days.Value);
        else if (dto.Hours is > 0)
            until = DateTime.UtcNow.AddHours(dto.Hours.Value);
        else
            return BadRequest("请提供 days、hours 或 until");

        user.BannedUntil = until;
        await _context.SaveChangesAsync();
        return Ok(new { message = "用户已封禁", bannedUntil = user.BannedUntil });
    }

    [HttpPost("users/{id:int}/unban")]
    public async Task<IActionResult> UnbanUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");

        user.BannedUntil = null;
        await _context.SaveChangesAsync();
        return Ok(new { message = "已解除封禁" });
    }

    [HttpGet("badges")]
    public ActionResult<object> ListBadges() => Ok(BadgeIds.All);
}

public class AdminSetXpDto
{
    public int TotalXP { get; set; }
}

public class AdminBadgeDto
{
    public string BadgeId { get; set; } = string.Empty;
}

public class AdminBanDto
{
    public int? Days { get; set; }
    public int? Hours { get; set; }
    public DateTime? Until { get; set; }
}
