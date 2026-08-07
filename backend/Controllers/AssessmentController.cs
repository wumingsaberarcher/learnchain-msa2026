using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Controllers;

[ApiController]
[Route("api/assessment")]
[Authorize]
public class AssessmentController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AssessmentService _assessment;

    public AssessmentController(AppDbContext db, AssessmentService assessment)
    {
        _db = db;
        _assessment = assessment;
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("未登录或 Token 无效");
        return int.Parse(claim.Value);
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] AssessmentGenerateRequest request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == GetCurrentUserId(), ct);
        if (user == null) return Unauthorized();

        try
        {
            var questions = await _assessment.GenerateAsync(user, request, ct);
            var habit = await _db.Habits.FirstAsync(h => h.Id == request.HabitId && h.UserId == user.Id, ct);
            return Ok(new
            {
                habitId = habit.Id,
                habitName = habit.Name,
                difficulty = string.IsNullOrWhiteSpace(habit.AssessmentDifficulty) ? "easy" : habit.AssessmentDifficulty,
                questions
            });
        }
        catch (InvalidOperationException ex) when (ex.Message == "missing_api_key")
        {
            return BadRequest(new { error = "missing_api_key" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("grade")]
    public async Task<IActionResult> Grade([FromBody] AssessmentGradeRequest request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == GetCurrentUserId(), ct);
        if (user == null) return Unauthorized();

        try
        {
            var result = await _assessment.GradeAsync(user, request, ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex) when (ex.Message == "missing_api_key")
        {
            return BadRequest(new { error = "missing_api_key" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
