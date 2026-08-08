using backend.Data;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace backend.Controllers;

[ApiController]
[Route("api/canal")]
[Authorize]
public class CanalController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CanalTrustService _trust;
    private readonly CurriculumSourceCatalog _sources;

    public CanalController(AppDbContext db, CanalTrustService trust, CurriculumSourceCatalog sources)
    {
        _db = db;
        _trust = trust;
        _sources = sources;
    }

    private int GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException();
        return int.Parse(claim.Value);
    }

    [HttpGet("trust")]
    public async Task<IActionResult> GetTrust(CancellationToken ct = default)
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();

        // Stage 2+ must never sit on an empty curriculum: sweep any stage that was skipped
        // (admin trust jumps bypass the chat-driven inject path).
        var backfill = await _trust.BackfillCurriculumAsync(user, zh: true, force: false, ct);

        var snap = _trust.SnapshotConfigured(user);
        await _db.SaveChangesAsync(ct);
        return Ok(new
        {
            level = snap.Level,
            points = snap.Points,
            stageKey = snap.StageKey,
            addressKey = snap.AddressKey,
            injectedCount = snap.InjectedCount,
            completedCount = snap.CompletedCount,
            lessonsToStage2 = snap.LessonsToStage2,
            loreKeys = snap.LoreKeys,
            affectionTierKey = snap.AffectionTierKey,
            evaluation = snap.Evaluation,
            unifiedWithAffection = true,
            currentEchelon = snap.CurrentEchelon,
            lessonsNeededToAdvance = snap.LessonsNeededToAdvance,
            backfill = MapBackfill(backfill)
        });
    }

    /// <summary>Manual catch-up: dispatch every lesson of the current stage and below that is missing.</summary>
    [HttpPost("curriculum/backfill")]
    public async Task<IActionResult> BackfillCurriculum(
        [FromQuery] bool force = false,
        [FromQuery] string? language = null,
        CancellationToken ct = default)
    {
        var user = await _db.Users.FindAsync([GetUserId()], ct);
        if (user == null) return NotFound();
        var zh = string.IsNullOrWhiteSpace(language)
                 || language.StartsWith("zh", StringComparison.OrdinalIgnoreCase);

        var result = await _trust.BackfillCurriculumAsync(user, zh, force, ct);
        return Ok(MapBackfill(result));
    }

    private static object MapBackfill(CurriculumBackfillResult r) => new
    {
        ran = r.Ran,
        reason = r.Reason,
        stage = r.Stage,
        created = r.Created,
        createdLessonIds = r.CreatedLessonIds,
        gaps = r.Gaps.Select(g => new
        {
            stage = g.Stage,
            echelon = g.Echelon,
            total = g.Total,
            dispatched = g.Dispatched,
            missing = g.Missing
        })
    };

    [HttpGet("lore")]
    public async Task<IActionResult> GetLore([FromQuery] string? language)
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();
        var zh = string.IsNullOrWhiteSpace(language)
                 || language.StartsWith("zh", StringComparison.OrdinalIgnoreCase);
        var snap = _trust.SnapshotConfigured(user);
        return Ok(new
        {
            level = snap.Level,
            items = _trust.GetUnlockableLore(snap.Level, zh)
        });
    }

    /// <summary>
    /// Design §7–8 source registry. Filter by echelon + topic; originCountry is provenance only.
    /// </summary>
    [HttpGet("sources")]
    public IActionResult ListSources([FromQuery] string? echelon = null, [FromQuery] string? topic = null, [FromQuery] string? id = null)
    {
        if (!string.IsNullOrWhiteSpace(id))
        {
            var one = _sources.GetById(id);
            if (one == null) return NotFound(new { error = "document_not_found", id });
            return Ok(new { document = one });
        }

        var docs = _sources.Search(echelon, topic);
        return Ok(new
        {
            note = "Source registry only — no extracted knowledge chunks. Cite document.id; do not filter teaching by originCountry.",
            portals = _sources.Portals,
            count = docs.Count,
            documents = docs.Select(d => new
            {
                d.Id,
                d.Title,
                d.Year,
                d.OriginCountry,
                d.DocType,
                d.Echelons,
                d.Topics,
                d.UrlOrLocator,
                d.AccessNote,
                d.Section
            })
        });
    }
}
