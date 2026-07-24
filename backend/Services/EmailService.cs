using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace backend.Services;

/// <summary>
/// Sends email via Brevo HTTPS API (recommended on Render free tier — SMTP ports are blocked)
/// or classic SMTP (fine for local / paid hosts).
/// </summary>
public class EmailService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<EmailService> _logger;

    public EmailService(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<EmailService> logger)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public bool IsConfigured() =>
        HasBrevo() || HasSmtp();

    private bool HasBrevo() =>
        !string.IsNullOrWhiteSpace(_configuration["Brevo:ApiKey"]);

    private bool HasSmtp() =>
        !string.IsNullOrWhiteSpace(_configuration["Smtp:Host"]);

    public async Task SendAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        if (!IsConfigured())
        {
            throw new InvalidOperationException(
                "Email is not configured. On Render free tier set Brevo__ApiKey + Brevo__FromEmail (HTTPS). " +
                "Locally you can use Smtp__Host instead.");
        }

        // Prefer Brevo on cloud hosts — SMTP ports 25/465/587 are blocked on Render free.
        if (HasBrevo())
        {
            await SendViaBrevoAsync(toEmail, subject, htmlBody, ct);
            return;
        }

        await SendViaSmtpAsync(toEmail, subject, htmlBody, ct);
    }

    private async Task SendViaBrevoAsync(string toEmail, string subject, string htmlBody, CancellationToken ct)
    {
        var apiKey = _configuration["Brevo:ApiKey"]!.Trim();
        var fromEmail = (_configuration["Brevo:FromEmail"] ?? _configuration["Smtp:From"] ?? "").Trim();
        var fromName = (_configuration["Brevo:FromName"] ?? "LearnChain").Trim();

        if (string.IsNullOrWhiteSpace(fromEmail))
            throw new InvalidOperationException("Brevo__FromEmail is required (must be a sender verified in Brevo).");

        // Allow "Name <email@x.com>" or bare email
        if (fromEmail.Contains('<') && fromEmail.Contains('>'))
        {
            var start = fromEmail.IndexOf('<') + 1;
            var end = fromEmail.IndexOf('>');
            fromName = fromEmail[..(start - 1)].Trim().Trim('"');
            fromEmail = fromEmail[start..end].Trim();
        }

        var payload = new
        {
            sender = new { name = fromName, email = fromEmail },
            to = new[] { new { email = toEmail } },
            subject,
            htmlContent = htmlBody
        };

        var client = _httpClientFactory.CreateClient("Brevo");
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email");
        req.Headers.TryAddWithoutValidation("api-key", apiKey);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var res = await client.SendAsync(req, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            _logger.LogWarning("Brevo send failed {Status}: {Body}", (int)res.StatusCode, body);
            throw new InvalidOperationException($"Brevo API error ({(int)res.StatusCode}): {Truncate(body, 300)}");
        }

        _logger.LogInformation("Email sent via Brevo to {Email}: {Subject}", toEmail, subject);
    }

    private async Task SendViaSmtpAsync(string toEmail, string subject, string htmlBody, CancellationToken ct)
    {
        var host = _configuration["Smtp:Host"]!;
        var port = int.TryParse(_configuration["Smtp:Port"], out var p) ? p : 587;
        var user = _configuration["Smtp:User"];
        var password = _configuration["Smtp:Password"];
        var from = _configuration["Smtp:From"] ?? user ?? "noreply@learnchain.local";
        var useSsl = !string.Equals(_configuration["Smtp:UseSsl"], "false", StringComparison.OrdinalIgnoreCase);

        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(from));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = subject;
        message.Body = new TextPart("html") { Text = htmlBody };

        using var client = new SmtpClient();
        var secure = useSsl
            ? (port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls)
            : SecureSocketOptions.None;

        await client.ConnectAsync(host, port, secure, ct);

        if (!string.IsNullOrWhiteSpace(user))
            await client.AuthenticateAsync(user, password ?? string.Empty, ct);

        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);

        _logger.LogInformation("Email sent via SMTP to {Email}: {Subject}", toEmail, subject);
    }

    public async Task SendTodayDigestAsync(
        string toEmail,
        string username,
        IEnumerable<(string Name, bool Checked, bool DueToday)> habits,
        string language,
        CancellationToken ct = default)
    {
        var zh = language.StartsWith("zh", StringComparison.OrdinalIgnoreCase);
        var pending = habits.Where(h => h.DueToday && !h.Checked).ToList();
        var done = habits.Where(h => h.DueToday && h.Checked).ToList();

        var subject = zh
            ? $"LearnChain 今日任务摘要 — {DateTime.UtcNow:yyyy-MM-dd}"
            : $"LearnChain Today Summary — {DateTime.UtcNow:yyyy-MM-dd}";

        var pendingHtml = pending.Count == 0
            ? (zh ? "<li>今天没有待打卡任务 🎉</li>" : "<li>Nothing due today 🎉</li>")
            : string.Join("", pending.Select(h => $"<li>{System.Net.WebUtility.HtmlEncode(h.Name)}</li>"));

        var doneHtml = done.Count == 0
            ? ""
            : $"<p><strong>{(zh ? "已完成" : "Done")}:</strong></p><ul>{string.Join("", done.Select(h => $"<li>{System.Net.WebUtility.HtmlEncode(h.Name)}</li>"))}</ul>";

        var html = $"""
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
              <h2>{(zh ? $"你好，{username}" : $"Hi, {username}")}</h2>
              <p>{(zh ? "这是你的 LearnChain 今日任务摘要：" : "Here is your LearnChain task summary for today:")}</p>
              <p><strong>{(zh ? "待完成" : "Pending")}:</strong></p>
              <ul>{pendingHtml}</ul>
              {doneHtml}
              <p style="color:#888;font-size:12px">{(zh ? "由 LearnChain AI 助手发送" : "Sent by LearnChain AI Assistant")}</p>
            </div>
            """;

        await SendAsync(toEmail, subject, html, ct);
    }

    public async Task SendPasswordResetAsync(
        string toEmail,
        string username,
        string resetCode,
        string language,
        CancellationToken ct = default)
    {
        var zh = language.StartsWith("zh", StringComparison.OrdinalIgnoreCase);
        var subject = zh ? "LearnChain 找回账号与重置密码" : "LearnChain Account Recovery";
        var safeUser = System.Net.WebUtility.HtmlEncode(username);
        var safeCode = System.Net.WebUtility.HtmlEncode(resetCode);

        var html = zh
            ? $"""
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
                <h2>找回你的 LearnChain 账号</h2>
                <p>你的用户名是：<strong>{safeUser}</strong></p>
                <p>请在应用中输入以下 6 位验证码以设置新密码（30 分钟内有效）：</p>
                <p style="font-size:28px;letter-spacing:6px;font-weight:700">{safeCode}</p>
                <p style="color:#888;font-size:12px">如非本人操作，请忽略本邮件。</p>
              </div>
              """
            : $"""
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
                <h2>Recover your LearnChain account</h2>
                <p>Your username is: <strong>{safeUser}</strong></p>
                <p>Enter this 6-digit code in the app to set a new password (valid for 30 minutes):</p>
                <p style="font-size:28px;letter-spacing:6px;font-weight:700">{safeCode}</p>
                <p style="color:#888;font-size:12px">If you did not request this, you can ignore this email.</p>
              </div>
              """;

        await SendAsync(toEmail, subject, html, ct);
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..max] + "…";
}
