using System.Security.Claims;
using System.Text.Json;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

/// <summary>SuperAdmin-only Canal debug + knowledge + bond controls.</summary>
[ApiController]
[Route("api/admin/canal")]
[Authorize(Roles = AppRoles.SuperAdmin)]
public class CanalAdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CanalTrustService _trust;
    private readonly CanalKnowledgeService _knowledge;
    private readonly CurriculumSourceCatalog _sources;
    private readonly IConfiguration _config;
    private readonly HabitMaterialTextExtractor _extractor;
    private readonly IWebHostEnvironment _env;

    public CanalAdminController(
        AppDbContext db,
        CanalTrustService trust,
        CanalKnowledgeService knowledge,
        CurriculumSourceCatalog sources,
        IConfiguration config,
        HabitMaterialTextExtractor extractor,
        IWebHostEnvironment env)
    {
        _db = db;
        _trust = trust;
        _knowledge = knowledge;
        _sources = sources;
        _config = config;
        _extractor = extractor;
        _env = env;
    }

    private int? CallerId
    {
        get
        {
            var raw = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(raw, out var id) ? id : null;
        }
    }

    /// <summary>Self always ok; other SuperAdmins blocked; Users/Admins ok.</summary>
    private bool CanEditBond(User target) =>
        CallerId == target.Id || !AppRoles.IsSuperAdmin(target.Role);

    [HttpGet("debug")]
    public async Task<ActionResult<object>> GetDebug(CancellationToken ct)
    {
        await _knowledge.EnsureSeededAsync(ct);
        var kbCount = await _db.CanalKnowledgeEntries.CountAsync(e => e.IsActive, ct);
        var lessons = _trust.AllLessons
            .GroupBy(l => l.Echelon)
            .Select(g => new { echelon = g.Key, count = g.Count() })
            .OrderBy(x => x.echelon)
            .ToList();

        return Ok(new
        {
            identity = new
            {
                name = "Canal",
                nameZh = "凯娜尔",
                summaryZh = "第四驻防军团指挥 AI 残核（Alpha 全实例）素体化身；对外战术教练。",
                summaryEn = "4th garrison command AI remnant (Alpha full-instance) in chassis form; public face = tactics coach.",
            },
            live2d = new
            {
                modelUrl = "/Canal/Canal-vts2.0/Canal.model3.json",
                cubismCore = "/lib/live2dcubismcore.min.js",
                expressions = new[] { "normal", "smile", "angry", "sorrow", "surprise", "fear" },
                note = "Presets in frontend canalExpressions.ts; emotion timeline in emotionTimeline.ts",
            },
            triggers = new
            {
                checkInAffection = true,
                curriculumInject = new
                {
                    stage0Blocked = true,
                    stage1DailyCap = 1,
                    stage1InjectChance = _trust.Stage1InjectChance,
                    stage2PlusDailyCap = 1,
                    lessonsToAdvance = _trust.LessonsToAdvance,
                },
                assessment = new
                {
                    curriculumForced = true,
                    creditOnPassOnly = true,
                    failNoAffectionPenalty = true,
                    syllabusFallback = true,
                },
                emotionFromText = true,
                companionTease = true,
            },
            stages = Enumerable.Range(0, 5).Select(level => new
            {
                level,
                stageKey = CanalTrustService.StageKey(level),
                addressKey = CanalTrustService.AddressKey(level),
                echelon = level >= 1 ? CanalTrustService.EchelonForStage(level) : "none",
                loreKeys = CanalTrustService.LoreKeysUpTo(level),
            }),
            curriculum = new
            {
                lessonCountsByEchelon = lessons,
                sourceDocuments = _sources.Documents.Count,
                sourcePortals = _sources.Portals.Count,
                knowledgeActive = kbCount,
            },
            affection = new
            {
                maxPoints = CompanionAffectionService.MaxPoints,
                dailyCap = CompanionAffectionService.DailyCap,
            },
            config = new
            {
                stage1InjectChance = _config.GetValue("CanalCurriculum:Stage1InjectChance", 0.22),
                lessonsToAdvance = _config.GetValue("CanalCurriculum:LessonsToAdvance", 3),
            }
        });
    }

    [HttpGet("users")]
    public async Task<ActionResult<object>> ListUsersForBond([FromQuery] string? q = null, CancellationToken ct = default)
    {
        var query = _db.Users.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            query = query.Where(u =>
                u.Username.ToLower().Contains(term) || u.Email.ToLower().Contains(term));
        }

        var users = await query.OrderByDescending(u => u.CreatedAt).Take(80).ToListAsync(ct);
        var result = users.Select(u =>
        {
            var aff = CompanionAffectionService.Snapshot(u);
            var snap = _trust.SnapshotConfigured(u);
            var state = CanalTrustService.ParseState(u.CurriculumStateJson);
            return new
            {
                u.Id,
                u.Username,
                u.Email,
                u.Role,
                trustLevel = snap.Level,
                trustStageKey = snap.StageKey,
                companionAffection = aff.Points,
                affectionTierKey = aff.TierKey,
                curriculumCompleted = state.Completed.Count,
                curriculumInjected = state.Injected.Count,
                injectCountToday = u.CurriculumInjectCountToday,
                canalEvaluation = u.CanalEvaluation,
                canEdit = CanEditBond(u),
            };
        });
        return Ok(result);
    }

    [HttpGet("users/{id:int}")]
    public async Task<ActionResult<object>> GetUserBond(int id, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync([id], ct);
        if (user == null) return NotFound("用户不存在");

        var aff = CompanionAffectionService.Snapshot(user);
        var snap = _trust.SnapshotConfigured(user);
        var state = CanalTrustService.ParseState(user.CurriculumStateJson);
        return Ok(new
        {
            user.Id,
            user.Username,
            user.Email,
            user.Role,
            trustLevel = snap.Level,
            trustStageKey = snap.StageKey,
            trustAddressKey = snap.AddressKey,
            currentEchelon = snap.CurrentEchelon,
            companionAffection = aff.Points,
            companionAffectionMax = aff.MaxPoints,
            affectionTierKey = aff.TierKey,
            affectionGainedToday = aff.GainedToday,
            curriculumStateJson = user.CurriculumStateJson,
            curriculumCompleted = state.Completed,
            curriculumInjected = state.Injected,
            injectCountToday = user.CurriculumInjectCountToday,
            injectDayUtc = user.CurriculumInjectDayUtc,
            canalEvaluation = user.CanalEvaluation,
            loreKeys = snap.LoreKeys,
            canEdit = CanEditBond(user),
        });
    }

    [HttpPut("users/{id:int}/bond")]
    public async Task<IActionResult> SetBond(int id, [FromBody] AdminCanalBondDto dto, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync([id], ct);
        if (user == null) return NotFound("用户不存在");
        if (!CanEditBond(user))
            return BadRequest("不能修改其他终极管理员的 Canal 绑定");

        if (dto.TrustLevel is int tl)
            user.TrustLevel = Math.Clamp(tl, 0, CanalTrustService.MaxTrustLevel);

        if (dto.CompanionAffection is int pts)
        {
            user.CompanionAffection = Math.Clamp(pts, 0, CompanionAffectionService.MaxPoints);
            user.TrustPoints = user.CompanionAffection;
        }

        if (dto.CurriculumStateJson != null)
        {
            try
            {
                var parsed = CanalTrustService.ParseState(dto.CurriculumStateJson);
                user.CurriculumStateJson = JsonSerializer.Serialize(parsed);
            }
            catch
            {
                return BadRequest("CurriculumStateJson 无效");
            }
        }

        if (dto.ResetInjectToday == true)
        {
            user.CurriculumInjectCountToday = 0;
            user.CurriculumInjectDayUtc = DateTime.UtcNow.Date;
        }

        if (dto.RefreshEvaluation)
            await _trust.RefreshEvaluationAsync(user, zh: true, ct);

        await _db.SaveChangesAsync(ct);
        var snap = _trust.SnapshotConfigured(user);
        var aff = CompanionAffectionService.Snapshot(user);
        return Ok(new
        {
            message = "Canal 绑定已更新",
            user.Id,
            trustLevel = snap.Level,
            trustStageKey = snap.StageKey,
            companionAffection = aff.Points,
            affectionTierKey = aff.TierKey,
            canalEvaluation = user.CanalEvaluation,
        });
    }

    [HttpGet("knowledge")]
    public async Task<ActionResult<object>> ListKnowledge(
        [FromQuery] string? category = null,
        [FromQuery] bool includeInactive = true,
        CancellationToken ct = default)
    {
        await _knowledge.EnsureSeededAsync(ct);
        var rows = await _knowledge.ListAsync(category, includeInactive, ct);
        return Ok(rows.Select(MapKnowledge));
    }

    [HttpPost("knowledge")]
    public async Task<IActionResult> CreateKnowledge([FromBody] AdminCanalKnowledgeDto dto, CancellationToken ct)
    {
        try
        {
            var entry = await _knowledge.CreateAsync(dto, ct);
            return Ok(MapKnowledge(entry));
        }
        catch (InvalidOperationException ex) when (ex.Message == "entry_key_exists")
        {
            return BadRequest("entryKey 已存在");
        }
    }

    [HttpPut("knowledge/{id:int}")]
    public async Task<IActionResult> UpdateKnowledge(int id, [FromBody] AdminCanalKnowledgeDto dto, CancellationToken ct)
    {
        try
        {
            var entry = await _knowledge.UpdateAsync(id, dto, ct);
            if (entry == null) return NotFound();
            return Ok(MapKnowledge(entry));
        }
        catch (InvalidOperationException ex) when (ex.Message == "entry_key_exists")
        {
            return BadRequest("entryKey 已存在");
        }
    }

    [HttpDelete("knowledge/{id:int}")]
    public async Task<IActionResult> DeleteKnowledge(int id, CancellationToken ct)
    {
        var ok = await _knowledge.DeleteAsync(id, ct);
        if (!ok) return NotFound();
        return Ok(new { message = "已删除或停用", id });
    }

    /// <summary>Upload PDF/docx/md/txt; extract text into the entry so Canal can recall it.</summary>
    [HttpPost("knowledge/{id:int}/upload")]
    [RequestSizeLimit(HabitMaterialTextExtractor.MaxUploadBytes)]
    public async Task<IActionResult> UploadKnowledgeDocument(int id, IFormFile file, CancellationToken ct)
    {
        var entry = await _knowledge.GetAsync(id, ct);
        if (entry == null) return NotFound("知识条目不存在");

        if (file == null || file.Length == 0)
            return BadRequest("请选择文件");
        if (file.Length > HabitMaterialTextExtractor.MaxUploadBytes)
            return BadRequest("文件过大（上限 8MB）");
        if (!_extractor.IsAllowed(file.FileName))
            return BadRequest("仅支持 pdf / docx / md / txt");

        var safeName = Path.GetFileName(file.FileName);
        var dir = Path.Combine(_env.ContentRootPath, "App_Data", "canal-knowledge", id.ToString());
        Directory.CreateDirectory(dir);
        var storedName = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}{Path.GetExtension(safeName)}";
        var fullPath = Path.Combine(dir, storedName);

        await using (var fs = System.IO.File.Create(fullPath))
            await file.CopyToAsync(fs, ct);

        string extracted;
        await using (var read = System.IO.File.OpenRead(fullPath))
            extracted = await _extractor.ExtractAsync(safeName, read, ct);

        if (string.IsNullOrWhiteSpace(extracted))
            return BadRequest("未能抽取到可用文本（扫描版 PDF 可能需要 OCR）");

        var updated = await _knowledge.AttachDocumentAsync(
            id, safeName, _extractor.DetectContentType(safeName), file.Length, fullPath, extracted, ct);
        return Ok(MapKnowledge(updated!));
    }

    [HttpPost("knowledge/upload")]
    [RequestSizeLimit(HabitMaterialTextExtractor.MaxUploadBytes)]
    public async Task<IActionResult> UploadNewKnowledgeDocument(
        IFormFile file,
        [FromForm] string? category,
        [FromForm] string? titleZh,
        [FromForm] string? titleEn,
        [FromForm] int minTrustLevel = 1,
        CancellationToken ct = default)
    {
        if (file == null || file.Length == 0)
            return BadRequest("请选择文件");
        if (file.Length > HabitMaterialTextExtractor.MaxUploadBytes)
            return BadRequest("文件过大（上限 8MB）");
        if (!_extractor.IsAllowed(file.FileName))
            return BadRequest("仅支持 pdf / docx / md / txt");

        var safeName = Path.GetFileName(file.FileName);
        var cat = CanalKnowledgeService.NormalizeCategory(category ?? "military");
        var title = string.IsNullOrWhiteSpace(titleZh) ? Path.GetFileNameWithoutExtension(safeName) : titleZh.Trim();

        var entry = await _knowledge.CreateAsync(new AdminCanalKnowledgeDto
        {
            EntryKey = $"upload.{Guid.NewGuid():N}",
            Category = cat,
            TitleZh = title,
            TitleEn = string.IsNullOrWhiteSpace(titleEn) ? title : titleEn.Trim(),
            BodyZh = "",
            BodyEn = "",
            MinTrustLevel = Math.Clamp(minTrustLevel, 0, CanalTrustService.MaxTrustLevel),
            Section = "upload",
            IsActive = true,
            SortOrder = 5000,
        }, ct);

        var dir = Path.Combine(_env.ContentRootPath, "App_Data", "canal-knowledge", entry.Id.ToString());
        Directory.CreateDirectory(dir);
        var storedName = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}{Path.GetExtension(safeName)}";
        var fullPath = Path.Combine(dir, storedName);
        await using (var fs = System.IO.File.Create(fullPath))
            await file.CopyToAsync(fs, ct);

        string extracted;
        await using (var read = System.IO.File.OpenRead(fullPath))
            extracted = await _extractor.ExtractAsync(safeName, read, ct);

        if (string.IsNullOrWhiteSpace(extracted))
        {
            await _knowledge.DeleteAsync(entry.Id, ct);
            return BadRequest("未能抽取到可用文本（扫描版 PDF 可能需要 OCR）");
        }

        var updated = await _knowledge.AttachDocumentAsync(
            entry.Id, safeName, _extractor.DetectContentType(safeName), file.Length, fullPath, extracted, ct);
        return Ok(MapKnowledge(updated!));
    }

    [HttpPost("knowledge/reseed")]
    public async Task<IActionResult> ReseedKnowledge(CancellationToken ct)
    {
        await _knowledge.EnsureSeededAsync(ct);
        var count = await _db.CanalKnowledgeEntries.CountAsync(ct);
        return Ok(new { message = "已同步内置身份与 §7–8 文献登记", count });
    }

    private static object MapKnowledge(CanalKnowledgeEntry e) => new
    {
        e.Id,
        e.EntryKey,
        e.Category,
        e.TitleZh,
        e.TitleEn,
        e.BodyZh,
        e.BodyEn,
        e.MinTrustLevel,
        e.Section,
        e.IsBuiltin,
        e.IsActive,
        e.SortOrder,
        e.CreatedAt,
        e.UpdatedAt,
        e.FileName,
        e.ContentType,
        e.FileSize,
        hasDocument = !string.IsNullOrWhiteSpace(e.ExtractedText),
        textLength = e.ExtractedText?.Length ?? 0,
    };
}
