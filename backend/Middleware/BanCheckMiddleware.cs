using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Middleware;

/// <summary>Blocks authenticated users who are currently banned.</summary>
public class BanCheckMiddleware
{
    private readonly RequestDelegate _next;

    public BanCheckMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var idClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(idClaim, out var userId))
            {
                var bannedUntil = await db.Users
                    .Where(u => u.Id == userId)
                    .Select(u => u.BannedUntil)
                    .FirstOrDefaultAsync();

                if (bannedUntil.HasValue && bannedUntil.Value > DateTime.UtcNow)
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsJsonAsync(new
                    {
                        message = "账号已被封禁",
                        bannedUntil = bannedUntil.Value
                    });
                    return;
                }
            }
        }

        await _next(context);
    }
}
