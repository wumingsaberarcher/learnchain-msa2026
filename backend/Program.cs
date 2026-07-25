using backend.Data;
using backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using System.Text;

Console.WriteLine("[LearnChain] Starting…");

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Render injects PORT at runtime; bind to it so the service is reachable.
    var port = Environment.GetEnvironmentVariable("PORT");
    if (!string.IsNullOrWhiteSpace(port))
    {
        builder.WebHost.UseUrls($"http://+:{port}");
        Console.WriteLine($"[LearnChain] Binding to PORT={port}");
    }

    builder.Services.AddControllers();
    builder.Services.AddOpenApi();

    var (connectionString, dbProvider) = DatabaseConnection.Resolve(builder.Configuration);
    if (dbProvider == DatabaseProviderKind.Postgres
        && !connectionString.Contains("Maximum Pool Size", StringComparison.OrdinalIgnoreCase))
    {
        connectionString = connectionString.TrimEnd(';')
            + ";Maximum Pool Size=5;Timeout=30;Command Timeout=30";
    }

    builder.Services.AddDbContext<AppDbContext>(options =>
    {
        if (dbProvider == DatabaseProviderKind.Postgres)
            options.UseNpgsql(connectionString);
        else
            options.UseSqlite(connectionString);
    });
    Console.WriteLine($"[LearnChain] Database provider: {dbProvider}");

    var jwtSettings = builder.Configuration.GetSection("Jwt");
    var jwtKey = jwtSettings["Key"]
        ?? Environment.GetEnvironmentVariable("JWT_KEY")
        ?? throw new InvalidOperationException("JWT Key is not configured. Set Jwt:Key or JWT_KEY.");
    var key = Encoding.ASCII.GetBytes(jwtKey);

    builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = false;
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ValidateIssuer = true,
            ValidIssuer = jwtSettings["Issuer"],
            ValidateAudience = true,
            ValidAudience = jwtSettings["Audience"],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
    });

    builder.Services.AddAuthorization();
    builder.Services.AddScoped<AchievementService>();
    builder.Services.AddScoped<HabitContextBuilder>();
    builder.Services.AddScoped<AiAssistantService>();
    builder.Services.AddSingleton<EmailService>();
    builder.Services.AddHttpClient("OpenAiCompatible", client =>
    {
        client.Timeout = TimeSpan.FromSeconds(90);
    });
    builder.Services.AddHttpClient("Brevo", client =>
    {
        client.Timeout = TimeSpan.FromSeconds(30);
    });
    builder.Services.AddHostedService<DailyDigestHostedService>();

    var corsOrigins = builder.Configuration["Cors:AllowedOrigins"];
    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            if (!string.IsNullOrWhiteSpace(corsOrigins))
            {
                policy.WithOrigins(corsOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            }
            else
            {
                policy.AllowAnyOrigin()
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            }
        });
    });

    var app = builder.Build();

    using (var scope = app.Services.CreateScope())
    {
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Console.WriteLine("[LearnChain] Applying database schema…");
        DatabaseMigrator.ApplyMigrations(dbContext);
        Console.WriteLine("[LearnChain] Database ready.");
    }

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.MapScalarApiReference();
    }

    app.UseCors();
    app.UseAuthentication();
    app.UseAuthorization();

    app.MapControllers();
    app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "learnchain-backend" }));

    Console.WriteLine("[LearnChain] Listening…");
    app.Run();
}
catch (Exception ex)
{
    Console.Error.WriteLine("[LearnChain] FATAL startup error:");
    Console.Error.WriteLine(ex);
    Environment.ExitCode = 1;
    throw;
}

public partial class Program { }
