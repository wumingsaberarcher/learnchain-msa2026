using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Controllers;

[ApiController]
[Route("api/habit-group")]
[Authorize]
public class HabitGroupController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly HabitGroupDescriptionService _descriptions;

    public HabitGroupController(AppDbContext db, HabitGroupDescriptionService descriptions)
    {
        _db = db;
        _descriptions = descriptions;
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("未登录或 Token 无效");
        return int.Parse(claim.Value);
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<object>>> List()
    {
        var userId = GetCurrentUserId();
        var groups = await _db.HabitGroups
            .Where(g => g.UserId == userId && g.IsActive)
            .OrderByDescending(g => g.CreatedAt)
            .ToListAsync();

        var groupIds = groups.Select(g => g.Id).ToList();
        var habitCounts = await _db.Habits
            .Where(h => h.UserId == userId && h.IsActive && h.GroupId != null && groupIds.Contains(h.GroupId.Value))
            .GroupBy(h => h.GroupId!.Value)
            .Select(g => new { GroupId = g.Key, Count = g.Count() })
            .ToListAsync();
        var materialCounts = await _db.HabitGroupMaterials
            .Where(m => m.UserId == userId && groupIds.Contains(m.GroupId))
            .GroupBy(m => m.GroupId)
            .Select(g => new { GroupId = g.Key, Count = g.Count() })
            .ToListAsync();

        var habitMap = habitCounts.ToDictionary(x => x.GroupId, x => x.Count);
        var matMap = materialCounts.ToDictionary(x => x.GroupId, x => x.Count);

        return Ok(groups.Select(g => new
        {
            g.Id,
            g.Name,
            g.Description,
            g.CreatedAt,
            habitCount = habitMap.GetValueOrDefault(g.Id),
            materialCount = matMap.GetValueOrDefault(g.Id)
        }));
    }

    [HttpPost]
    public async Task<ActionResult<object>> Create([FromBody] CreateHabitGroupRequest request)
    {
        var userId = GetCurrentUserId();
        var name = (request.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest("组名不能为空");

        var group = new HabitGroup
        {
            UserId = userId,
            Name = name,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.HabitGroups.Add(group);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            group.Id,
            group.Name,
            group.Description,
            group.CreatedAt,
            habitCount = 0,
            materialCount = 0
        });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateHabitGroupRequest request)
    {
        var userId = GetCurrentUserId();
        var group = await _db.HabitGroups.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId && g.IsActive);
        if (group == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name))
            group.Name = request.Name.Trim();
        if (request.Description != null)
            group.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        await _db.SaveChangesAsync();
        return Ok(new { group.Id, group.Name, group.Description, group.CreatedAt });
    }

    /// <summary>
    /// AI-generate a group description from shared materials (+ optional habit chat).
    /// Requires at least one material with extractable text (server or local excerpts).
    /// </summary>
    [HttpPost("{id:int}/generate-description")]
    public async Task<IActionResult> GenerateDescription(int id, [FromBody] GenerateGroupDescriptionRequest request)
    {
        var userId = GetCurrentUserId();
        try
        {
            var (description, sourceNote) = await _descriptions.GenerateAsync(userId, id, request ?? new GenerateGroupDescriptionRequest());
            return Ok(new { description, sourceNote });
        }
        catch (InvalidOperationException ex)
        {
            return ex.Message switch
            {
                "missing_api_key" => BadRequest(new { error = "missing_api_key", message = "API key required" }),
                "group_not_found" => NotFound(new { error = "group_not_found" }),
                "description_exists" => Conflict(new { error = "description_exists", message = "Group already has a description" }),
                "no_materials" => BadRequest(new { error = "no_materials", message = "Upload materials with text first" }),
                "empty_llm" => BadRequest(new { error = "empty_llm", message = "AI returned empty description" }),
                _ => BadRequest(new { error = "generate_failed", message = ex.Message })
            };
        }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = GetCurrentUserId();
        var group = await _db.HabitGroups.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId && g.IsActive);
        if (group == null) return NotFound();

        group.IsActive = false;
        var members = await _db.Habits.Where(h => h.UserId == userId && h.GroupId == id).ToListAsync();
        foreach (var h in members)
            h.GroupId = null;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Move one habit into this group, or pass groupId null via body to ungroup (use /members/move).</summary>
    [HttpPut("{id:int}/members")]
    public async Task<IActionResult> SetMembers(int id, [FromBody] SetGroupMembersRequest request)
    {
        var userId = GetCurrentUserId();
        var group = await _db.HabitGroups.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId && g.IsActive);
        if (group == null) return NotFound("组不存在");

        var habitIds = (request.HabitIds ?? new List<int>()).Where(x => x > 0).Distinct().ToList();
        var habits = await _db.Habits
            .Where(h => h.UserId == userId && h.IsActive && habitIds.Contains(h.Id))
            .ToListAsync();

        // Habits currently in this group but not in the new list → ungroup
        var current = await _db.Habits
            .Where(h => h.UserId == userId && h.IsActive && h.GroupId == id)
            .ToListAsync();
        foreach (var h in current)
        {
            if (!habitIds.Contains(h.Id))
                h.GroupId = null;
        }

        foreach (var h in habits)
            h.GroupId = id;

        await _db.SaveChangesAsync();
        return Ok(new { groupId = id, habitIds = habits.Select(h => h.Id).ToList() });
    }

    [HttpPut("move")]
    public async Task<IActionResult> MoveHabit([FromBody] MoveHabitGroupRequest request)
    {
        var userId = GetCurrentUserId();
        var habit = await _db.Habits.FirstOrDefaultAsync(h => h.Id == request.HabitId && h.UserId == userId && h.IsActive);
        if (habit == null) return NotFound("习惯不存在");

        if (request.GroupId is int gid)
        {
            var group = await _db.HabitGroups.FirstOrDefaultAsync(g => g.Id == gid && g.UserId == userId && g.IsActive);
            if (group == null) return NotFound("组不存在");
            habit.GroupId = gid;
        }
        else
        {
            habit.GroupId = null;
        }

        await _db.SaveChangesAsync();
        return Ok(new { habit.Id, habit.GroupId });
    }
}

public class CreateHabitGroupRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public class UpdateHabitGroupRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
}

public class SetGroupMembersRequest
{
    public List<int>? HabitIds { get; set; }
}

public class MoveHabitGroupRequest
{
    public int HabitId { get; set; }
    public int? GroupId { get; set; }
}
