namespace backend.Services;

public static class ChatImageHelper
{
    /// <summary>Max decoded image bytes (~1MB). Keep small for proxy / provider limits.</summary>
    public const int MaxBytes = 1024 * 1024;

    private static readonly HashSet<string> AllowedMimes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
    };

    public static bool TryParse(
        string? dataUrl,
        string? rawBase64,
        string? rawMime,
        out string mime,
        out string base64Payload,
        out string error)
    {
        mime = "";
        base64Payload = "";
        error = "";

        if (!string.IsNullOrWhiteSpace(rawBase64))
        {
            var normalized = NormalizeMime(rawMime);
            if (normalized == null)
            {
                error = "Unsupported image type. Use jpeg/png/webp/gif.";
                return false;
            }

            mime = normalized;
            base64Payload = CompactBase64(rawBase64);
            return ValidateBase64Size(base64Payload, out error);
        }

        if (string.IsNullOrWhiteSpace(dataUrl))
        {
            error = "empty";
            return false;
        }

        var s = dataUrl.Trim();
        if (!s.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            error = "Unsupported image. Use jpeg/png/webp/gif data URL.";
            return false;
        }

        var comma = s.IndexOf(',');
        if (comma <= 5)
        {
            error = "Unsupported image. Use jpeg/png/webp/gif data URL.";
            return false;
        }

        var header = s[..comma];
        var payload = s[(comma + 1)..];
        // data:image/jpeg;base64
        var mimeStart = "data:".Length;
        var semi = header.IndexOf(';', mimeStart);
        var mimePart = semi > mimeStart ? header[mimeStart..semi] : header[mimeStart..];
        if (!header.Contains(";base64", StringComparison.OrdinalIgnoreCase))
        {
            error = "Image must be base64-encoded.";
            return false;
        }

        var normalizedMime = NormalizeMime(mimePart);
        if (normalizedMime == null)
        {
            error = "Unsupported image. Use jpeg/png/webp/gif.";
            return false;
        }

        mime = normalizedMime;
        base64Payload = CompactBase64(payload);
        return ValidateBase64Size(base64Payload, out error);
    }

    public static string NormalizeDataUrl(string mime, string base64Payload) =>
        $"data:{mime};base64,{base64Payload}";

    /// <summary>Models that almost certainly cannot see images.</summary>
    public static bool LikelyNonVisionModel(string? model)
    {
        if (string.IsNullOrWhiteSpace(model)) return false;
        var m = model.Trim().ToLowerInvariant();
        if (m.Contains("vision", StringComparison.Ordinal)
            || m.Contains("-vl", StringComparison.Ordinal)
            || m.Contains("gpt-4o", StringComparison.Ordinal)
            || m.Contains("gpt-4.1", StringComparison.Ordinal)
            || m.Contains("gpt-5", StringComparison.Ordinal)
            || m.Contains("gemini", StringComparison.Ordinal)
            || m.Contains("claude-3", StringComparison.Ordinal)
            || m.Contains("claude-4", StringComparison.Ordinal)
            || m.Contains("glm-4v", StringComparison.Ordinal)
            || m.Contains("qwen2-vl", StringComparison.Ordinal)
            || m.Contains("qwen-vl", StringComparison.Ordinal))
            return false;

        return m.Contains("deepseek-chat", StringComparison.Ordinal)
            || m.Contains("deepseek-reasoner", StringComparison.Ordinal)
            || m.Contains("gpt-3.5", StringComparison.Ordinal)
            || m.Contains("o1-mini", StringComparison.Ordinal)
            || m.Contains("o3-mini", StringComparison.Ordinal)
            || m is "deepseek" or "deepseek-v3" or "deepseek-v3.1";
    }

    public static bool LooksLikeVisionApiError(string? body)
    {
        if (string.IsNullOrWhiteSpace(body)) return false;
        var t = body.ToLowerInvariant();
        return t.Contains("image", StringComparison.Ordinal)
            || t.Contains("vision", StringComparison.Ordinal)
            || t.Contains("multimodal", StringComparison.Ordinal)
            || t.Contains("does not support", StringComparison.Ordinal)
            || t.Contains("not support", StringComparison.Ordinal)
            || t.Contains("invalid_image", StringComparison.Ordinal)
            || t.Contains("unsupported", StringComparison.Ordinal);
    }

    private static string? NormalizeMime(string? mime)
    {
        if (string.IsNullOrWhiteSpace(mime)) return "image/jpeg";
        var m = mime.Trim().ToLowerInvariant();
        if (m == "image/jpg") m = "image/jpeg";
        return AllowedMimes.Contains(m) ? (m == "image/jpg" ? "image/jpeg" : m) : null;
    }

    private static string CompactBase64(string value) =>
        value.Trim().Replace("\r", "", StringComparison.Ordinal).Replace("\n", "", StringComparison.Ordinal).Replace(" ", "", StringComparison.Ordinal);

    private static bool ValidateBase64Size(string base64Payload, out string error)
    {
        error = "";
        if (base64Payload.Length < 8)
        {
            error = "Invalid image data.";
            return false;
        }

        try
        {
            // Avoid allocating full byte[] twice: estimate first, then decode.
            var approx = (base64Payload.Length * 3L) / 4L;
            if (approx > MaxBytes)
            {
                error = $"Image too large (max {MaxBytes / 1024}KB).";
                return false;
            }

            var bytes = Convert.FromBase64String(base64Payload);
            if (bytes.Length == 0 || bytes.Length > MaxBytes)
            {
                error = $"Image too large (max {MaxBytes / 1024}KB).";
                return false;
            }
        }
        catch (FormatException)
        {
            error = "Invalid base64 image.";
            return false;
        }

        return true;
    }
}
