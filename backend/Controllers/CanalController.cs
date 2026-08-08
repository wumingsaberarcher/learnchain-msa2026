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
    public async Task<IActionResult> GetTrust()
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();
        var snap = _trust.SnapshotConfigured(user);
        await _db.SaveChangesAsync();
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
            lessonsNeededToAdvance = snap.LessonsNeededToAdvance
        });
    }

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
