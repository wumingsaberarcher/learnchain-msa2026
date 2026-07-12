using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UserController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly AchievementService _achievements;

    public UserController(AppDbContext context, IConfiguration configuration, AchievementService achievements)
    {
        _context = context;
        _configuration = configuration;
        _achievements = achievements;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
            return BadRequest("用户名和密码不能为空");

        if (string.IsNullOrWhiteSpace(dto.Email) || !IsValidEmail(dto.Email))
            return BadRequest("请提供有效的邮箱地址");

        var username = dto.Username.Trim();
        var email = dto.Email.Trim().ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.Username == username))
            return BadRequest("用户名已存在");

        if (await _context.Users.AnyAsync(u => u.Email.ToLower() == email))
            return BadRequest("邮箱已被注册");

        var user = new User
        {
            Username = username,
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            TotalXP = 0,
            Level = 1,
            CreatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return Ok(new { message = "注册成功" });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Login) || string.IsNullOrWhiteSpace(dto.Password))
            return Unauthorized("请输入用户名/邮箱和密码");

        var login = dto.Login.Trim();
        var loginLower = login.ToLowerInvariant();

        var user = await _context.Users.FirstOrDefaultAsync(u =>
            u.Username == login || u.Email.ToLower() == loginLower);

        if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            return Unauthorized("用户名/邮箱或密码错误");

        var token = GenerateJwtToken(user);
        var newlyUnlocked = await _achievements.EvaluateAndUnlockAsync(user.Id);

        return Ok(new
        {
            token,
            user = new
            {
                user.Id,
                user.Username,
                user.Email,
                user.TotalXP,
                user.Level,
                user.Bio,
                user.CreatedAt
            },
            newlyUnlocked
        });
    }

    [HttpGet("me")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<ActionResult<object>> GetCurrentUser()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null)
            return Unauthorized("未登录或 Token 无效");

        int userId = int.Parse(userIdClaim.Value);

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
            return NotFound("用户不存在");

        return Ok(new
        {
            user.Id,
            user.Username,
            user.Email,
            user.TotalXP,
            user.Level,
            user.Bio,
            user.CreatedAt,
            achievements = await _achievements.GetAchievementStatusAsync(userId)
        });
    }

    [HttpPut("profile")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = await _context.Users.FindAsync(userId);
        if (user == null) return NotFound("用户不存在");

        if (dto.Bio != null)
            user.Bio = dto.Bio.Trim();

        await _context.SaveChangesAsync();
        return Ok(new { message = "资料已更新", user.Bio });
    }

    [HttpPost("change-password")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.OldPassword) || string.IsNullOrWhiteSpace(dto.NewPassword))
            return BadRequest("请填写当前密码和新密码");

        if (dto.NewPassword.Length < 6)
            return BadRequest("新密码至少 6 位");

        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = await _context.Users.FindAsync(userId);
        if (user == null) return NotFound("用户不存在");

        if (!BCrypt.Net.BCrypt.Verify(dto.OldPassword, user.PasswordHash))
            return BadRequest("当前密码不正确");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        await _context.SaveChangesAsync();
        return Ok(new { message = "密码已更新" });
    }

    [HttpPost("achievements/sync")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> SyncAchievements()
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var newlyUnlocked = await _achievements.EvaluateAndUnlockAsync(userId);
        var achievements = await _achievements.GetAchievementStatusAsync(userId);
        return Ok(new { newlyUnlocked, achievements });
    }

    private static bool IsValidEmail(string email)
    {
        return Regex.IsMatch(email.Trim(),
            @"^[^@\s]+@[^@\s]+\.[^@\s]+$",
            RegexOptions.IgnoreCase);
    }

    private string GenerateJwtToken(User user)
    {
        var jwtSettings = _configuration.GetSection("Jwt");
        var key = Encoding.ASCII.GetBytes(jwtSettings["Key"]!);

        var tokenHandler = new JwtSecurityTokenHandler();
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Email, user.Email)
            }),
            Expires = DateTime.UtcNow.AddMinutes(double.Parse(jwtSettings["DurationInMinutes"]!)),
            Issuer = jwtSettings["Issuer"],
            Audience = jwtSettings["Audience"],
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }
}

public class RegisterDto
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginDto
{
    public string Login { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class UpdateProfileDto
{
    public string? Bio { get; set; }
}

public class ChangePasswordDto
{
    public string OldPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}
