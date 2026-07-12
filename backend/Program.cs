using backend.Data;
using backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Render injects PORT at runtime; bind to it so the service is reachable.
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://+:{port}");
}

// ====================== 服务注册 ======================

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// 配置 EF Core + SQLite
var connectionString = ResolveSqliteConnectionString(builder.Configuration);
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(connectionString));

// ====================== JWT 配置 ======================

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

// CORS — set Cors__AllowedOrigins on Render (comma-separated Vercel URLs)
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

// ====================== 数据库初始化（重要！） ======================
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    DatabaseMigrator.ApplyMigrations(dbContext);
}

// ====================== 中间件配置 ======================

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

// app.UseHttpsRedirection();   // 开发阶段建议注释掉
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "learnchain-backend" }));

app.Run();

static string ResolveSqliteConnectionString(IConfiguration configuration)
{
    var raw = configuration.GetConnectionString("DefaultConnection")?.Trim().Trim('"', '\'');
    if (string.IsNullOrWhiteSpace(raw))
        return "Data Source=learnchain.db";

    // Render/Docker env vars sometimes break on the space in "Data Source=".
    if (raw.Equals("Data", StringComparison.OrdinalIgnoreCase))
        return "DataSource=/app/data/learnchain.db";

    // User pasted only a file path in the dashboard.
    if (!raw.Contains('=') &&
        (raw.StartsWith('/') || raw.StartsWith("./") || raw.EndsWith(".db", StringComparison.OrdinalIgnoreCase)))
    {
        return $"Data Source={raw}";
    }

    return raw;
}

public partial class Program { }