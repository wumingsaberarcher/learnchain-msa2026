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
            string habitName;
            string difficulty;
            if (request.Practice && request.GroupId is int gid && gid > 0 && request.HabitId <= 0)
            {
                var group = await _db.HabitGroups.FirstAsync(g => g.Id == gid && g.UserId == user.Id && g.IsActive, ct);
                habitName = group.Name;
                difficulty = string.IsNullOrWhiteSpace(request.Difficulty) ? "easy" : request.Difficulty;
            }
            else
            {
                var habit = await _db.Habits.FirstAsync(h => h.Id == request.HabitId && h.UserId == user.Id, ct);
                habitName = habit.Name;
                difficulty = string.IsNullOrWhiteSpace(request.Difficulty)
                    ? (string.IsNullOrWhiteSpace(habit.AssessmentDifficulty) ? "easy" : habit.AssessmentDifficulty)
                    : request.Difficulty;
            }

            return Ok(new
            {
                habitId = request.HabitId,
                groupId = request.GroupId,
                practice = request.Practice,
                habitName,
                difficulty,
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
