using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UserController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly AchievementService _achievements;
    private readonly EmailService _email;

    public UserController(
        AppDbContext context,
        IConfiguration configuration,
        AchievementService achievements,
        EmailService email)
    {
        _context = context;
        _configuration = configuration;
        _achievements = achievements;
        _email = email;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
            return BadRequest("用户名和密码不能为空");

        if (!AuthValidation.IsValidUsername(dto.Username))
            return BadRequest(AuthValidation.UsernameRuleMessageZh);

        if (!AuthValidation.IsValidPassword(dto.Password))
            return BadRequest(AuthValidation.PasswordRuleMessageZh);

        if (string.IsNullOrWhiteSpace(dto.Email) || !AuthValidation.IsValidEmail(dto.Email))
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

    /// <summary>
    /// Request a password-reset code by email. Always returns a generic success message
    /// when the request is well-formed (does not reveal whether the email exists).
    /// </summary>
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Email) || !AuthValidation.IsValidEmail(dto.Email))
            return BadRequest("请提供有效的邮箱地址");

        if (!_email.IsConfigured())
            return BadRequest("服务器未配置邮件服务，暂时无法找回密码。请联系管理员。");

        var email = dto.Email.Trim().ToLowerInvariant();
        var language = string.IsNullOrWhiteSpace(dto.Language) ? "zh" : dto.Language.Trim();

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email, ct);
        if (user != null)
        {
            var code = AuthValidation.GenerateResetCode();
            user.PasswordResetTokenHash = AuthValidation.HashResetCode(code);
            user.PasswordResetExpiresAt = DateTime.UtcNow.AddMinutes(30);
            await _context.SaveChangesAsync(ct);

            try
            {
                await _email.SendPasswordResetAsync(user.Email, user.Username, code, language, ct);
            }
            catch (Exception)
            {
                user.PasswordResetTokenHash = null;
                user.PasswordResetExpiresAt = null;
                await _context.SaveChangesAsync(ct);
                return StatusCode(502, "邮件发送失败，请稍后重试");
            }
        }

        return Ok(new
        {
            message = "如果该邮箱已注册，我们已发送包含用户名和验证码的邮件。请查收收件箱（含垃圾邮件）。"
        });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Email) || !AuthValidation.IsValidEmail(dto.Email))
            return BadRequest("请提供有效的邮箱地址");

        if (string.IsNullOrWhiteSpace(dto.Code) || dto.Code.Trim().Length != 6)
            return BadRequest("请输入邮件中的 6 位验证码");

        if (!AuthValidation.IsValidPassword(dto.NewPassword))
            return BadRequest(AuthValidation.PasswordRuleMessageZh);

        var email = dto.Email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
        if (user == null ||
            user.PasswordResetExpiresAt == null ||
            user.PasswordResetExpiresAt < DateTime.UtcNow ||
            !AuthValidation.ResetCodeMatches(dto.Code, user.PasswordResetTokenHash))
        {
            return BadRequest("验证码无效或已过期，请重新申请找回密码");
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        user.PasswordResetTokenHash = null;
        user.PasswordResetExpiresAt = null;
        await _context.SaveChangesAsync();

        return Ok(new { message = "密码已重置，请使用新密码登录", username = user.Username });
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

        if (!AuthValidation.IsValidPassword(dto.NewPassword))
            return BadRequest(AuthValidation.PasswordRuleMessageZh);

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

public class ForgotPasswordDto
{
    public string Email { get; set; } = string.Empty;
    public string? Language { get; set; }
}

public class ResetPasswordDto
{
    public string Email { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}
