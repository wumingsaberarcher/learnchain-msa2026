using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace backend.Services;

public static class AuthValidation
{
    // English letters only, 3–20 characters
    private static readonly Regex UsernameRegex = new(@"^[A-Za-z]{3,20}$", RegexOptions.Compiled);

    // 8–64 chars, letters + digits only, must include at least one of each
    private static readonly Regex PasswordRegex = new(
        @"^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,64}$",
        RegexOptions.Compiled);

    private static readonly Regex EmailRegex = new(
        @"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static bool IsValidUsername(string? username) =>
        !string.IsNullOrWhiteSpace(username) && UsernameRegex.IsMatch(username.Trim());

    public static bool IsValidPassword(string? password) =>
        !string.IsNullOrEmpty(password) && PasswordRegex.IsMatch(password);

    public static bool IsValidEmail(string? email) =>
        !string.IsNullOrWhiteSpace(email) && EmailRegex.IsMatch(email.Trim());

    public const string UsernameRuleMessageZh =
        "用户名须为 3–20 位英文字母（不含空格、数字或符号）";

    public const string UsernameRuleMessageEn =
        "Username must be 3–20 English letters (no spaces, digits, or symbols)";

    public const string PasswordRuleMessageZh =
        "密码须为 8–64 位，且同时包含英文字母和数字（不含符号）";

    public const string PasswordRuleMessageEn =
        "Password must be 8–64 characters and include both English letters and digits (no symbols)";

    public static string GenerateResetCode()
    {
        var value = RandomNumberGenerator.GetInt32(0, 1_000_000);
        return value.ToString("D6");
    }

    public static string HashResetCode(string code)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(code.Trim()));
        return Convert.ToHexString(bytes);
    }

    public static bool ResetCodeMatches(string code, string? storedHash)
    {
        if (string.IsNullOrWhiteSpace(storedHash)) return false;
        try
        {
            var hash = HashResetCode(code);
            var a = Convert.FromHexString(hash);
            var b = Convert.FromHexString(storedHash);
            return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
        }
        catch
        {
            return false;
        }
    }
}
