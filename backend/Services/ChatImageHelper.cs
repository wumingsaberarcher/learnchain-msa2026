using System.Text.RegularExpressions;

namespace backend.Services;

public static class ChatImageHelper
{
    public const int MaxBytes = 2 * 1024 * 1024;

    private static readonly Regex DataUrlRe = new(
        @"^data:(image/(jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static bool TryParse(string? dataUrl, out string mime, out string base64Payload, out string error)
    {
        mime = "";
        base64Payload = "";
        error = "";
        if (string.IsNullOrWhiteSpace(dataUrl))
        {
            error = "empty";
            return false;
        }

        var m = DataUrlRe.Match(dataUrl.Trim());
        if (!m.Success)
        {
            error = "Unsupported image. Use jpeg/png/webp/gif data URL.";
            return false;
        }

        mime = m.Groups[1].Value.ToLowerInvariant();
        if (mime == "image/jpg") mime = "image/jpeg";
        base64Payload = Regex.Replace(m.Groups[3].Value, @"\s+", "");
        try
        {
            var bytes = Convert.FromBase64String(base64Payload);
            if (bytes.Length == 0 || bytes.Length > MaxBytes)
            {
                error = $"Image too large (max {MaxBytes / (1024 * 1024)}MB).";
                return false;
            }
        }
        catch
        {
            error = "Invalid base64 image.";
            return false;
        }

        return true;
    }

    public static string NormalizeDataUrl(string mime, string base64Payload) =>
        $"data:{mime};base64,{base64Payload}";
}
