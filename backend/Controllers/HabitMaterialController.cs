using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Controllers;

[ApiController]
[Route("api/habit/{habitId:int}/materials")]
[Authorize]
public class HabitMaterialController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly HabitMaterialTextExtractor _extractor;
    private readonly IWebHostEnvironment _env;

    public HabitMaterialController(
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

    private async Task<Habit?> FindHabitAsync(int habitId, int userId) =>
        await _db.Habits.FirstOrDefaultAsync(h => h.Id == habitId && h.UserId == userId);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<object>>> List(int habitId)
    {
        var userId = GetCurrentUserId();
        if (await FindHabitAsync(habitId, userId) == null)
            return NotFound("习惯不存在或无权限");

        var items = await _db.HabitMaterials
            .Where(m => m.HabitId == habitId && m.UserId == userId)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id,
                m.HabitId,
                m.FileName,
                m.ContentType,
                m.Size,
                hasText = m.ExtractedText != "",
                textLength = m.ExtractedText.Length,
                m.CreatedAt
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost]
    [RequestSizeLimit(12 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 12 * 1024 * 1024)]
    public async Task<ActionResult<object>> Upload(int habitId, [FromForm] IFormFile? file, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (await FindHabitAsync(habitId, userId) == null)
            return NotFound("习惯不存在或无权限");

        // Be tolerant of form field names (file / files / first attachment).
        var upload = file
            ?? Request.Form.Files.GetFile("file")
            ?? Request.Form.Files.FirstOrDefault();
        if (upload == null || upload.Length == 0)
            return BadRequest("请选择文件（未收到上传内容）");

        if (upload.Length > HabitMaterialTextExtractor.MaxUploadBytes)
            return BadRequest("文件过大（上限 8MB）");

        if (!_extractor.IsAllowed(upload.FileName))
            return BadRequest("仅支持 pdf / docx / doc / wps / md / txt（WPS 建议另存为 .docx 或 .pdf）");

        string extracted;
        try
        {
            await using var read = upload.OpenReadStream();
            extracted = await _extractor.ExtractAsync(upload.FileName, read, ct);
        }
        catch (Exception ex)
        {
            return BadRequest($"无法提取文本：{ex.Message}");
        }

        var ext = Path.GetExtension(upload.FileName ?? "").ToLowerInvariant();
        var hasText = !string.IsNullOrWhiteSpace(extracted);
        string? warning = null;
        if (!hasText)
        {
            warning = ext is ".doc" or ".wps"
                ? "未能抽出文字。请用 WPS/Word「另存为」.docx 或导出 PDF 后再上传，以便出题。"
                : "未能抽出可用文字（可能是扫描版/图片 PDF），已保存但无法用于出题";
        }

        var root = Path.Combine(_env.ContentRootPath, "App_Data", "habit-materials", userId.ToString(), habitId.ToString());
        Directory.CreateDirectory(root);
        var safeName = Path.GetFileName(upload.FileName);
        if (string.IsNullOrWhiteSpace(safeName))
            safeName = $"upload-{DateTime.UtcNow:yyyyMMddHHmmss}";
        var storedName = $"{Guid.NewGuid():N}_{safeName}";
        var fullPath = Path.Combine(root, storedName);

        await using (var fs = System.IO.File.Create(fullPath))
        {
            await using var src = upload.OpenReadStream();
            await src.CopyToAsync(fs, ct);
        }

        var material = new HabitMaterial
        {
            HabitId = habitId,
            UserId = userId,
            FileName = safeName,
            ContentType = string.IsNullOrWhiteSpace(upload.ContentType)
                ? _extractor.DetectContentType(safeName)
                : upload.ContentType,
            Size = upload.Length,
            StoredPath = Path.Combine(userId.ToString(), habitId.ToString(), storedName).Replace('\\', '/'),
            ExtractedText = extracted ?? "",
            CreatedAt = DateTime.UtcNow
        };

        _db.HabitMaterials.Add(material);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            material.Id,
            material.HabitId,
            material.FileName,
            material.ContentType,
            material.Size,
            hasText,
            textLength = material.ExtractedText.Length,
            warning,
            material.CreatedAt
        });
    }

    [HttpDelete("{materialId:int}")]
    public async Task<IActionResult> Delete(int habitId, int materialId)
    {
        var userId = GetCurrentUserId();
        var material = await _db.HabitMaterials
            .FirstOrDefaultAsync(m => m.Id == materialId && m.HabitId == habitId && m.UserId == userId);

        if (material == null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(material.StoredPath))
        {
            var full = Path.Combine(_env.ContentRootPath, "App_Data", "habit-materials", material.StoredPath.Replace('/', Path.DirectorySeparatorChar));
            if (System.IO.File.Exists(full))
            {
                try { System.IO.File.Delete(full); } catch { /* ignore */ }
            }
        }

        _db.HabitMaterials.Remove(material);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
