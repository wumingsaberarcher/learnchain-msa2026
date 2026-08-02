using backend.Data;
using backend.Middleware;
using backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using System.Security.Claims;
using System.Text;

Console.WriteLine("[LearnChain] Starting…");

// Npgsql rejects DateTime Kind=Unspecified for timestamptz (common after SQLite → Postgres).
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

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
            RoleClaimType = ClaimTypes.Role,
            ClockSkew = TimeSpan.FromMinutes(2)
        };
    });

    builder.Services.AddAuthorization();
    builder.Services.AddScoped<AchievementService>();
    builder.Services.AddScoped<HabitContextBuilder>();
    builder.Services.AddScoped<CompanionMemoryService>();
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

    // CORS: Bearer-token API (no cookies) — allow any browser origin so Vercel never gets blocked.
    // Optional Cors__AllowedOrigins is ignored for simplicity; tighten later if needed.
    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod());
    });

    var app = builder.Build();

    using (var scope = app.Services.CreateScope())
    {
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Console.WriteLine("[LearnChain] Applying database schema…");
        DatabaseMigrator.ApplyMigrations(dbContext);
        Console.WriteLine("[LearnChain] Database ready.");
    }

    var bootstrapLogger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("AdminBootstrap");
    await AdminBootstrap.EnsureAdminAsync(app.Services, app.Configuration, bootstrapLogger);

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.MapScalarApiReference();
    }

    // Endpoint routing order: Routing → static music → CORS → Auth
    app.UseRouting();

    var musicRoot = Path.Combine(app.Environment.ContentRootPath, "Music");
    if (Directory.Exists(musicRoot))
    {
        var contentTypes = new FileExtensionContentTypeProvider();
        contentTypes.Mappings[".aac"] = "audio/aac";
        contentTypes.Mappings[".m4a"] = "audio/mp4";
        contentTypes.Mappings[".mp3"] = "audio/mpeg";
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(musicRoot),
            RequestPath = "/music",
            ContentTypeProvider = contentTypes,
            OnPrepareResponse = ctx =>
            {
                ctx.Context.Response.Headers.CacheControl = "public,max-age=86400";
            }
        });
        Console.WriteLine($"[LearnChain] Serving BGM from {musicRoot}");
    }
    else
    {
        Console.WriteLine($"[LearnChain] Music folder not found at {musicRoot}");
    }

    app.UseCors();
    app.UseAuthentication();
    app.UseMiddleware<BanCheckMiddleware>();
    app.UseAuthorization();

    app.MapControllers();
    app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "learnchain-backend" }));
    app.MapGet("/music/tracks", () => Results.Ok(new[]
    {
        new { id = "ceta", title = "CETA", file = "ceta.aac", unlock = "default" },
        new { id = "faster-than-light", title = "Faster Than Light", file = "faster-than-light.aac", unlock = "allBadges" },
        new { id = "waiting-for-the-sun", title = "Waiting for the Sun", file = "waiting-for-the-sun.aac", unlock = "allBadges" },
    }));

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
