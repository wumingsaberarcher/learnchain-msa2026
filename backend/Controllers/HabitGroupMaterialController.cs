using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Controllers;

/// <summary>
/// Mirrors <see cref="HabitMaterialController"/> so group uploads use the same binding/stream path.
/// </summary>
[ApiController]
[Route("api/habit-group/{groupId:int}/materials")]
[Authorize]
public class HabitGroupMaterialController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly HabitMaterialTextExtractor _extractor;
    private readonly IWebHostEnvironment _env;

    public HabitGroupMaterialController(
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

    private Task<bool> GroupOwnedAsync(int groupId, int userId) =>
        _db.HabitGroups.AnyAsync(g => g.Id == groupId && g.UserId == userId && g.IsActive);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<object>>> List(int groupId)
    {
        var userId = GetCurrentUserId();
        if (!await GroupOwnedAsync(groupId, userId))
            return NotFound("组不存在");

        var items = await _db.HabitGroupMaterials
            .Where(m => m.GroupId == groupId && m.UserId == userId)
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

    [HttpPost]
    [RequestSizeLimit(HabitMaterialTextExtractor.MaxUploadBytes)]
    public async Task<ActionResult<object>> Upload(int groupId, IFormFile? file, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!await GroupOwnedAsync(groupId, userId))
            return NotFound("组不存在");

        // Prefer bound file; fall back if the field name was altered by a proxy.
        var uploadFile = file
            ?? Request.Form.Files.GetFile("file")
            ?? Request.Form.Files.FirstOrDefault();
        if (uploadFile == null || uploadFile.Length == 0)
            return BadRequest("请选择文件");

        if (uploadFile.Length > HabitMaterialTextExtractor.MaxUploadBytes)
            return BadRequest("文件过大（上限 8MB）");

        if (!_extractor.IsAllowed(uploadFile.FileName))
            return BadRequest("仅支持 pdf / docx / doc / wps / md / txt（WPS 建议另存为 .docx 或 .pdf）");

        // Same pattern as HabitMaterialController: extract from stream, then CopyToAsync re-reads buffered upload.
        string extracted = "";
        string? warning = null;
        try
        {
            await using var read = uploadFile.OpenReadStream();
            extracted = await _extractor.ExtractAsync(uploadFile.FileName, read, ct);
        }
        catch (Exception ex)
        {
            // Do not reject the upload — keep the file for retry/manual use.
            warning = $"未能抽出文字：{ex.Message}";
            extracted = "";
        }

        var ext = Path.GetExtension(uploadFile.FileName ?? "").ToLowerInvariant();
        var hasText = !string.IsNullOrWhiteSpace(extracted);
        if (!hasText && warning == null)
        {
            warning = ext is ".doc" or ".wps"
                ? "未能抽出文字。请用 WPS/Word「另存为」.docx 或导出 PDF 后再上传，以便出题。"
                : "未能抽出可用文字（可能是扫描版/图片 PDF），已保存但无法用于出题";
        }

        var root = Path.Combine(_env.ContentRootPath, "App_Data", "habit-group-materials", userId.ToString(), groupId.ToString());
        Directory.CreateDirectory(root);
        var safeName = Path.GetFileName(uploadFile.FileName);
        if (string.IsNullOrWhiteSpace(safeName))
            safeName = $"upload-{DateTime.UtcNow:yyyyMMddHHmmss}";
        var storedName = $"{Guid.NewGuid():N}_{safeName}";
        var fullPath = Path.Combine(root, storedName);

        try
        {
            await using (var fs = System.IO.File.Create(fullPath))
            {
                await uploadFile.CopyToAsync(fs, ct);
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"无法写入服务器磁盘：{ex.Message}");
        }

        var material = new HabitGroupMaterial
        {
            GroupId = groupId,
            UserId = userId,
            FileName = safeName,
            ContentType = string.IsNullOrWhiteSpace(uploadFile.ContentType)
                ? _extractor.DetectContentType(safeName)
                : uploadFile.ContentType,
            Size = uploadFile.Length,
            StoredPath = Path.Combine(userId.ToString(), groupId.ToString(), storedName).Replace('\\', '/'),
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

    [HttpDelete("{materialId:int}")]
    public async Task<IActionResult> Delete(int groupId, int materialId)
    {
        var userId = GetCurrentUserId();
        var material = await _db.HabitGroupMaterials
            .FirstOrDefaultAsync(m => m.Id == materialId && m.GroupId == groupId && m.UserId == userId);

        if (material == null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(material.StoredPath))
        {
            var full = Path.Combine(
                _env.ContentRootPath,
                "App_Data",
                "habit-group-materials",
                material.StoredPath.Replace('/', Path.DirectorySeparatorChar));
            try
            {
                if (System.IO.File.Exists(full))
                    System.IO.File.Delete(full);
            }
            catch
            {
                /* ignore disk errors on delete */
            }
        }

        _db.HabitGroupMaterials.Remove(material);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    public class RenameGroupMaterialRequest
    {
        public string FileName { get; set; } = string.Empty;
    }

    [HttpPut("{materialId:int}")]
    public async Task<ActionResult<object>> Rename(int groupId, int materialId, [FromBody] RenameGroupMaterialRequest request)
    {
        var userId = GetCurrentUserId();
        var material = await _db.HabitGroupMaterials
            .FirstOrDefaultAsync(m => m.Id == materialId && m.GroupId == groupId && m.UserId == userId);
        if (material == null) return NotFound();

        var raw = (request.FileName ?? "").Trim();
        if (string.IsNullOrWhiteSpace(raw))
            return BadRequest("文件名不能为空");

        // Prevent path tricks; keep a display name only (disk path stays Stable via StoredPath).
        var safe = Path.GetFileName(raw.Replace('\\', '/'));
        if (string.IsNullOrWhiteSpace(safe))
            return BadRequest("文件名无效");

        // If the user dropped the extension, keep the original one so extract/type stays coherent.
        var oldExt = Path.GetExtension(material.FileName);
        if (string.IsNullOrEmpty(Path.GetExtension(safe)) && !string.IsNullOrEmpty(oldExt))
            safe += oldExt;

        if (safe.Length > 200)
            safe = safe[..200];

        material.FileName = safe;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            material.Id,
            material.GroupId,
            material.FileName,
            material.ContentType,
            material.Size,
            hasText = material.ExtractedText != "",
            textLength = material.ExtractedText.Length,
            source = "group",
            material.CreatedAt
        });
    }
}
