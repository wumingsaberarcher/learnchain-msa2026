using System.Security.Claims;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = $"{AppRoles.Admin},{AppRoles.SuperAdmin}")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AchievementService _achievements;

    public AdminController(AppDbContext context, AchievementService achievements)
    {
        _context = context;
        _achievements = achievements;
    }

    private string CallerRole =>
        User.FindFirst(ClaimTypes.Role)?.Value ?? AppRoles.User;

    private bool CallerIsSuperAdmin => AppRoles.IsSuperAdmin(CallerRole);

    private int? CallerId
    {
        get
        {
            var raw = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(raw, out var id) ? id : null;
        }
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

        var result = users.Select(u =>
        {
            var aff = CompanionAffectionService.Snapshot(u);
            var state = CanalTrustService.ParseState(u.CurriculumStateJson);
            var level = CanalTrustService.CurriculumStage(u);
            return new
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
                badgeCount = badgeCounts.GetValueOrDefault(u.Id),
                companionAffection = aff.Points,
                companionAffectionMax = aff.MaxPoints,
                affectionTierKey = aff.TierKey,
                affectionTier = aff.Tier,
                trustStageKey = CanalTrustService.StageKey(level),
                trustLevel = level,
                curriculumCompleted = state.Completed.Count,
                canalEvaluation = string.IsNullOrWhiteSpace(u.CanalEvaluation)
                    ? CanalTrustService.BuildEvaluation(
                        true, u.Username, aff.Points, aff.TierKey, level,
                        state.Completed.Count, habitCounts.GetValueOrDefault(u.Id),
                        0, u.Level, u.TotalXP, u.IsBanned)
                    : u.CanalEvaluation
            };
        });

        return Ok(result);
    }

    [HttpGet("users/{id:int}")]
    public async Task<ActionResult<object>> GetUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");

        var achievements = await _achievements.GetAchievementStatusAsync(id);
        var aff = CompanionAffectionService.Snapshot(user);
        var state = CanalTrustService.ParseState(user.CurriculumStateJson);
        var level = CanalTrustService.CurriculumStage(user);
        var checkIns = await _context.CheckIns.CountAsync(c => c.UserId == id);
        var habits = await _context.Habits.CountAsync(h => h.UserId == id && h.IsActive);
        var evaluation = string.IsNullOrWhiteSpace(user.CanalEvaluation)
            ? CanalTrustService.BuildEvaluation(
                true, user.Username, aff.Points, aff.TierKey, level,
                state.Completed.Count, habits, checkIns, user.Level, user.TotalXP, user.IsBanned)
            : user.CanalEvaluation;

        var canalBlock = new
        {
            companionAffection = aff.Points,
            companionAffectionMax = aff.MaxPoints,
            affectionTierKey = aff.TierKey,
            affectionTier = aff.Tier,
            trustLevel = level,
            trustStageKey = CanalTrustService.StageKey(level),
            trustAddressKey = CanalTrustService.AddressKey(level),
            currentEchelon = level >= 1 ? CanalTrustService.EchelonForStage(level) : "none",
            curriculumCompleted = state.Completed.Count,
            curriculumInjected = state.Injected.Count,
            canalEvaluation = evaluation,
            checkInCount = checkIns,
            activeHabitCount = habits
        };

        if (CallerIsSuperAdmin)
        {
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
                user.DailyDigestEnabled,
                password = user.PasswordVault,
                passwordAvailable = !string.IsNullOrEmpty(user.PasswordVault),
                hasPendingReset = !string.IsNullOrEmpty(user.PasswordResetTokenHash)
                    && user.PasswordResetExpiresAt > DateTime.UtcNow,
                achievements,
                viewerIsSuperAdmin = true,
                canal = canalBlock,
                companionAffection = canalBlock.companionAffection,
                affectionTierKey = canalBlock.affectionTierKey,
                canalEvaluation = canalBlock.canalEvaluation
            });
        }

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
            achievements,
            viewerIsSuperAdmin = false,
            canal = canalBlock,
            companionAffection = canalBlock.companionAffection,
            affectionTierKey = canalBlock.affectionTierKey,
            canalEvaluation = canalBlock.canalEvaluation
        });
    }

    [HttpPut("users/{id:int}/xp")]
    public async Task<IActionResult> SetXp(int id, [FromBody] AdminSetXpDto dto)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");
        if (!CanManageTarget(user))
            return BadRequest("无权修改该账号的经验值");

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
        if (!CanManageTarget(user))
            return BadRequest("不能封禁该账号");

        const int minHours = 1;
        const int maxHours = 24 * 30;

        int hours;
        if (dto.Hours is > 0)
            hours = dto.Hours.Value;
        else if (dto.Days is > 0)
            hours = dto.Days.Value * 24;
        else
            return BadRequest("请提供 hours（1–720）或 days（最多 30）");

        if (hours < minHours || hours > maxHours)
            return BadRequest("封禁时长须在 1 小时到 30 天之间");

        user.BannedUntil = DateTime.UtcNow.AddHours(hours);
        await _context.SaveChangesAsync();
        return Ok(new { message = "用户已封禁", bannedUntil = user.BannedUntil, hours });
    }

    [HttpPost("users/{id:int}/unban")]
    public async Task<IActionResult> UnbanUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");
        if (AppRoles.IsSuperAdmin(user.Role))
            return BadRequest("终极管理员账号不可封禁，也无需解封");
        if (!CallerIsSuperAdmin && AppRoles.IsProtectedStaff(user.Role))
            return BadRequest("无权解封该账号");

        user.BannedUntil = null;
        await _context.SaveChangesAsync();
        return Ok(new { message = "已解除封禁" });
    }

    [HttpDelete("users/{id:int}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");
        if (!CanManageTarget(user))
            return BadRequest("不能删除该账号");

        if (CallerId == id)
            return BadRequest("不能删除当前登录账号");

        var habitIds = await _context.Habits
            .Where(h => h.UserId == id)
            .Select(h => h.Id)
            .ToListAsync();

        if (habitIds.Count > 0)
        {
            _context.CheckIns.RemoveRange(
                _context.CheckIns.Where(c => c.UserId == id || habitIds.Contains(c.HabitId)));
            _context.HabitMilestones.RemoveRange(
                _context.HabitMilestones.Where(m => habitIds.Contains(m.HabitId)));
            _context.Habits.RemoveRange(_context.Habits.Where(h => h.UserId == id));
        }
        else
        {
            _context.CheckIns.RemoveRange(_context.CheckIns.Where(c => c.UserId == id));
        }

        _context.UserAchievements.RemoveRange(
            _context.UserAchievements.Where(a => a.UserId == id));
        _context.Users.Remove(user);
        await _context.SaveChangesAsync();

        return Ok(new { message = "用户已删除", id });
    }

    /// <summary>SuperAdmin only: grant or revoke regular Admin role.</summary>
    [HttpPut("users/{id:int}/role")]
    [Authorize(Roles = AppRoles.SuperAdmin)]
    public async Task<IActionResult> SetRole(int id, [FromBody] AdminSetRoleDto dto)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");
        if (AppRoles.IsSuperAdmin(user.Role))
            return BadRequest("不能更改终极管理员的角色");
        if (CallerId == id)
            return BadRequest("不能更改自己的角色");

        var next = (dto.Role ?? "").Trim();
        if (next != AppRoles.User && next != AppRoles.Admin)
            return BadRequest("只能设置为 User 或 Admin");

        user.Role = next;
        await _context.SaveChangesAsync();
        return Ok(new { message = "角色已更新", user.Id, user.Role });
    }

    /// <summary>SuperAdmin only: set password (updates hash + vault) and return it once.</summary>
    [HttpPut("users/{id:int}/password")]
    [Authorize(Roles = AppRoles.SuperAdmin)]
    public async Task<IActionResult> SetPassword(int id, [FromBody] AdminSetPasswordDto dto)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound("用户不存在");
        if (AppRoles.IsSuperAdmin(user.Role) && CallerId != id)
            return BadRequest("不能修改其他终极管理员的密码");

        if (!AuthValidation.IsValidPassword(dto.Password))
            return BadRequest(AuthValidation.PasswordRuleMessageZh);

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);
        user.PasswordVault = dto.Password;
        user.PasswordResetTokenHash = null;
        user.PasswordResetExpiresAt = null;
        await _context.SaveChangesAsync();

        return Ok(new { message = "密码已更新", password = dto.Password });
    }

    [HttpGet("badges")]
    public ActionResult<object> ListBadges() => Ok(BadgeIds.All);

    /// <summary>
    /// Regular Admin: only manage Users.
    /// SuperAdmin: manage Users and Admins (never other SuperAdmins / self-protection for role).
    /// </summary>
    private bool CanManageTarget(User target)
    {
        if (AppRoles.IsSuperAdmin(target.Role))
            return false;

        if (CallerIsSuperAdmin)
            return true;

        // Regular Admin — original rules: only non-staff
        return !AppRoles.IsProtectedStaff(target.Role);
    }
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
    public int? Hours { get; set; }
    public int? Days { get; set; }
}

public class AdminSetRoleDto
{
    public string Role { get; set; } = AppRoles.User;
}

public class AdminSetPasswordDto
{
    public string Password { get; set; } = string.Empty;
}
