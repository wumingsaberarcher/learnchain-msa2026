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
    private readonly EmailService _email;

    public ChatController(
        AppDbContext context,
        AiAssistantService assistant,
        HabitContextBuilder habitContext,
        EmailService email)
    {
        _context = context;
        _assistant = assistant;
        _habitContext = habitContext;
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
}
