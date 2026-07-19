using backend.Data;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

/// <summary>Sends daily habit digests to users who opted in (UTC hour from config).</summary>
public class DailyDigestHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DailyDigestHostedService> _logger;

    public DailyDigestHostedService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<DailyDigestHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var hourUtc = int.TryParse(_configuration["Digest:HourUtc"], out var h) ? h : 8;
                var now = DateTime.UtcNow;
                var next = new DateTime(now.Year, now.Month, now.Day, hourUtc, 0, 0, DateTimeKind.Utc);
                if (next <= now) next = next.AddDays(1);

                var delay = next - now;
                _logger.LogInformation("Next daily digest at {Next} UTC (in {Delay})", next, delay);
                await Task.Delay(delay, stoppingToken);

                await RunDigestAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Daily digest loop error");
                try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); } catch { /* ignore */ }
            }
        }
    }

    private async Task RunDigestAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var email = scope.ServiceProvider.GetRequiredService<EmailService>();
        if (!email.IsConfigured())
        {
            _logger.LogInformation("Skipping daily digest — SMTP not configured");
            return;
        }

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var habitContext = scope.ServiceProvider.GetRequiredService<HabitContextBuilder>();

        var users = await db.Users
            .Where(u => u.DailyDigestEnabled && u.Email != "")
            .ToListAsync(ct);

        _logger.LogInformation("Sending daily digest to {Count} users", users.Count);

        foreach (var user in users)
        {
            try
            {
                var habits = await habitContext.GetActiveHabitsAsync(user.Id);
                await email.SendTodayDigestAsync(
                    user.Email,
                    user.Username,
                    habits.Select(h => (h.Name, h.IsCheckedToday, h.IsDueToday)),
                    "zh",
                    ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed digest for user {UserId}", user.Id);
            }
        }
    }
}
