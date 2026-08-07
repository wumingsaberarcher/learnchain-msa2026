using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AiAssistantService _assistant;
    private readonly HabitContextBuilder _habitContext;
    private readonly CompanionMemoryService _memory;
    private readonly CompanionAffectionService _affection;
    private readonly EmailService _email;

    public ChatController(
        AppDbContext context,
        AiAssistantService assistant,
        HabitContextBuilder habitContext,
        CompanionMemoryService memory,
        CompanionAffectionService affection,
        EmailService email)
    {
        _context = context;
        _assistant = assistant;
        _habitContext = habitContext;
        _memory = memory;
        _affection = affection;
        _email = email;
    }

    private async Task<User?> GetCurrentUserAsync()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (claim == null || !int.TryParse(claim.Value, out var id))
            return null;
        return await _context.Users.FindAsync(id);
    }

    [HttpPost]
    public async Task<ActionResult<ChatResponse>> Chat([FromBody] ChatRequest request, CancellationToken ct)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        if (request.Messages == null || request.Messages.Count == 0)
            return BadRequest("messages required");

        try
        {
            var result = await _assistant.ChatAsync(user, request, ct);
            var affection = await _affection.AwardChatAsync(user, ct);
            result.AffectionAwarded = affection.Awarded;
            result.AffectionPoints = affection.Points;
            result.AffectionTierKey = affection.TierKey;
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { message = ex.Message });
        }
    }

    [HttpPost("reminder")]
    public async Task<ActionResult<ReminderResponse>> SendReminder([FromQuery] string? language, CancellationToken ct)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        if (!_email.IsConfigured())
            return BadRequest(new ReminderResponse { Sent = false, Message = "SMTP is not configured on the server." });

        if (string.IsNullOrWhiteSpace(user.Email))
            return BadRequest(new ReminderResponse { Sent = false, Message = "Account has no email address." });

        try
        {
            var habits = await _habitContext.GetActiveHabitsAsync(user.Id);
            var lang = string.IsNullOrWhiteSpace(language) ? "zh" : language;
            await _email.SendTodayDigestAsync(
                user.Email,
                user.Username,
                habits.Select(h => (h.Name, h.IsCheckedToday, h.IsDueToday)),
                lang,
                ct);

            return Ok(new ReminderResponse
            {
                Sent = true,
                Message = $"Reminder sent to {user.Email}"
            });
        }
        catch (Exception ex)
        {
            return StatusCode(502, new ReminderResponse { Sent = false, Message = ex.Message });
        }
    }

    [HttpGet("preferences")]
    public async Task<ActionResult<ChatPreferencesDto>> GetPreferences()
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        return Ok(new ChatPreferencesDto { DailyDigestEnabled = user.DailyDigestEnabled });
    }

    [HttpPut("preferences")]
    public async Task<ActionResult<ChatPreferencesDto>> UpdatePreferences([FromBody] ChatPreferencesDto dto)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        user.DailyDigestEnabled = dto.DailyDigestEnabled;
        await _context.SaveChangesAsync();
        return Ok(new ChatPreferencesDto { DailyDigestEnabled = user.DailyDigestEnabled });
    }

    /// <summary>Load persisted short-term history + rolling summary for the companion UI.</summary>
    [HttpGet("history")]
    public async Task<ActionResult<ChatHistoryResponse>> GetHistory(
        [FromQuery] string? zoneType,
        [FromQuery] int? habitId,
        CancellationToken ct)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();

        var session = await _memory.GetOrCreateSessionAsync(user.Id, zoneType, habitId, ct);
        var messages = await _memory.GetRecentActiveMessagesAsync(
            session.Id, CompanionMemoryService.ShortTermMessageLimit * 2, ct);

        return Ok(new ChatHistoryResponse
        {
            Summary = session.Summary,
            Messages = messages.Select(m => new ChatHistoryMessageDto
            {
                Role = m.Role,
                Content = m.Content,
                CreatedAt = m.CreatedAt
            }).ToList()
        });
    }

    /// <summary>Reset conversation memory for the given zone (default: daily). Keeps long-term memories.</summary>
    [HttpDelete("session")]
    public async Task<IActionResult> ResetSession(
        [FromQuery] string? zoneType,
        [FromQuery] int? habitId,
        CancellationToken ct)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        // Default to current daily zone when unspecified (UI "clear chat").
        await _memory.ResetConversationAsync(user.Id, zoneType ?? ChatZones.Daily, habitId, ct);
        return Ok(new { message = "Conversation memory cleared" });
    }

    [HttpGet("memories")]
    public async Task<ActionResult<List<UserMemoryDto>>> ListMemories(
        [FromQuery] string? zoneType,
        [FromQuery] int? habitId,
        CancellationToken ct)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        var list = await _memory.ListMemoriesAsync(user.Id, zoneType, habitId, ct);
        return Ok(list.Select(m => new UserMemoryDto
        {
            Id = m.Id,
            Type = m.Type,
            Key = m.Key,
            Content = m.Content,
            Importance = m.Importance,
            UpdatedAt = m.UpdatedAt,
            ZoneType = m.ZoneType,
            HabitId = m.HabitId
        }).ToList());
    }

    [HttpDelete("memories/{id:int}")]
    public async Task<IActionResult> DeleteMemory(int id, CancellationToken ct)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        var ok = await _memory.SoftDeleteMemoryAsync(user.Id, id, ct);
        if (!ok) return NotFound();
        return Ok(new { message = "Memory deleted" });
    }

    /// <summary>Nuclear option: clear conversation + long-term memories. Game data untouched.</summary>
    [HttpDelete("memories")]
    public async Task<IActionResult> ResetAllMemories(CancellationToken ct)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        await _memory.ResetAllMemoryAsync(user.Id, ct);
        return Ok(new { message = "All companion memories cleared" });
    }

    /// <summary>Real Canal affection (per-user, slow grind).</summary>
    [HttpGet("affection")]
    public async Task<ActionResult<object>> GetAffection(CancellationToken ct)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return Unauthorized();
        var snap = CompanionAffectionService.Snapshot(user);
        await _context.SaveChangesAsync(ct);
        return Ok(new
        {
            points = snap.Points,
            maxPoints = snap.MaxPoints,
            tier = snap.Tier,
            tierKey = snap.TierKey,
            gainedToday = snap.GainedToday,
            dailyCap = snap.DailyCap,
            toNextTier = snap.ToNextTier,
        });
    }
}
