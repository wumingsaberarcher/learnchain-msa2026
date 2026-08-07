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
    private readonly HabitMaterialTextExtractor _extractor;
    private readonly IWebHostEnvironment _env;

    public HabitGroupController(
        AppDbContext db,
        HabitMaterialTextExtractor extractor,
        IWebHostEnvironment env)
    {
        _db = db;
        _extractor = extractor;
        _env = env;
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

    [HttpGet("{id:int}/materials")]
    public async Task<ActionResult<IEnumerable<object>>> ListMaterials(int id)
    {
        var userId = GetCurrentUserId();
        if (!await _db.HabitGroups.AnyAsync(g => g.Id == id && g.UserId == userId && g.IsActive))
            return NotFound("组不存在");

        var items = await _db.HabitGroupMaterials
            .Where(m => m.GroupId == id && m.UserId == userId)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id,
                m.GroupId,
                m.FileName,
                m.ContentType,
                m.Size,
                hasText = m.ExtractedText != "",
                textLength = m.ExtractedText.Length,
                source = "group",
                m.CreatedAt
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost("{id:int}/materials")]
    [RequestSizeLimit(HabitMaterialTextExtractor.MaxUploadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = HabitMaterialTextExtractor.MaxUploadBytes)]
    public async Task<ActionResult<object>> UploadMaterial(int id, [FromForm] IFormFile? file, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!await _db.HabitGroups.AnyAsync(g => g.Id == id && g.UserId == userId && g.IsActive))
            return NotFound("组不存在");

        // Some clients/proxies rename the field; accept first file if "file" is missing.
        file ??= Request.Form.Files.GetFile("file") ?? Request.Form.Files.FirstOrDefault();

        if (file == null || file.Length == 0)
            return BadRequest("请选择文件");
        if (file.Length > HabitMaterialTextExtractor.MaxUploadBytes)
            return BadRequest("文件过大（上限 8MB）");
        if (!_extractor.IsAllowed(file.FileName))
            return BadRequest("仅支持 pdf / docx / doc / wps / md / txt");

        // Buffer once so extract + disk write don't fight over a consumed stream.
        await using var upload = file.OpenReadStream();
        using var buffer = new MemoryStream(capacity: (int)Math.Min(file.Length, HabitMaterialTextExtractor.MaxUploadBytes));
        await upload.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();

        string extracted;
        try
        {
            await using var read = new MemoryStream(bytes, writable: false);
            extracted = await _extractor.ExtractAsync(file.FileName, read, ct);
        }
        catch (Exception ex)
        {
            return BadRequest($"无法提取文本：{ex.Message}");
        }

        var hasText = !string.IsNullOrWhiteSpace(extracted);
        var ext = Path.GetExtension(file.FileName ?? "").ToLowerInvariant();
        string? warning = null;
        if (!hasText)
        {
            warning = ext is ".doc" or ".wps"
                ? "未能抽出文字。请另存为 .docx 或 PDF。"
                : "未能抽出可用文字，已保存但无法用于出题";
        }

        var root = Path.Combine(_env.ContentRootPath, "App_Data", "habit-group-materials", userId.ToString(), id.ToString());
        Directory.CreateDirectory(root);
        var safeName = Path.GetFileName(file.FileName);
        if (string.IsNullOrWhiteSpace(safeName))
            safeName = $"upload-{DateTime.UtcNow:yyyyMMddHHmmss}";
        var storedName = $"{Guid.NewGuid():N}_{safeName}";
        var fullPath = Path.Combine(root, storedName);
        await System.IO.File.WriteAllBytesAsync(fullPath, bytes, ct);

        var material = new HabitGroupMaterial
        {
            GroupId = id,
            UserId = userId,
            FileName = safeName,
            ContentType = string.IsNullOrWhiteSpace(file.ContentType)
                ? _extractor.DetectContentType(safeName)
                : file.ContentType,
            Size = bytes.LongLength,
            StoredPath = Path.Combine(userId.ToString(), id.ToString(), storedName).Replace('\\', '/'),
            ExtractedText = extracted ?? "",
            CreatedAt = DateTime.UtcNow
        };
        _db.HabitGroupMaterials.Add(material);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            try { System.IO.File.Delete(fullPath); } catch { /* ignore */ }
            return StatusCode(500, $"保存资料失败：{ex.InnerException?.Message ?? ex.Message}");
        }

        return Ok(new
        {
            material.Id,
            material.GroupId,
            material.FileName,
            material.ContentType,
            material.Size,
            hasText,
            textLength = material.ExtractedText.Length,
            source = "group",
            warning,
            material.CreatedAt
        });
    }

    [HttpDelete("{id:int}/materials/{materialId:int}")]
    public async Task<IActionResult> DeleteMaterial(int id, int materialId)
    {
        var userId = GetCurrentUserId();
        var material = await _db.HabitGroupMaterials
            .FirstOrDefaultAsync(m => m.Id == materialId && m.GroupId == id && m.UserId == userId);
        if (material == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(material.StoredPath))
        {
            var full = Path.Combine(
                _env.ContentRootPath,
                "App_Data",
                "habit-group-materials",
                material.StoredPath.Replace('/', Path.DirectorySeparatorChar));
            if (System.IO.File.Exists(full))
            {
                try { System.IO.File.Delete(full); } catch { /* ignore */ }
            }
        }

        _db.HabitGroupMaterials.Remove(material);
        await _db.SaveChangesAsync();
        return NoContent();
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
