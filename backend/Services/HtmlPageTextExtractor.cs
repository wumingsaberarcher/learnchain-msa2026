using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace backend.Services;

/// <summary>Lightweight HTML → plain text for public news / white-paper pages.</summary>
public static class HtmlPageTextExtractor
{
    private static readonly Regex ScriptStyle = new(
        @"<(script|style|noscript|svg|iframe)[\s\S]*?</\1>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex Tags = new(@"<[^>]+>", RegexOptions.Compiled);
    private static readonly Regex Whitespace = new(@"[ \t]+\n", RegexOptions.Compiled);
    private static readonly Regex MultiBlank = new(@"\n{3,}", RegexOptions.Compiled);

    public static string ToPlainText(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return "";

        var s = ScriptStyle.Replace(html, " ");
        s = Regex.Replace(s, @"<(br|BR)\s*/?>", "\n", RegexOptions.Compiled);
        s = Regex.Replace(s, @"</(p|div|h[1-6]|li|tr|section|article)>", "\n", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        s = Tags.Replace(s, " ");
        s = WebUtility.HtmlDecode(s);
        s = Regex.Replace(s, @"[ \t]{2,}", " ");
        s = Whitespace.Replace(s, "\n");
        s = MultiBlank.Replace(s, "\n\n");
        return s.Trim();
    }

    /// <summary>Best-effort: prefer &lt;article&gt; / common content containers.</summary>
    public static string ExtractArticleish(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return "";

        foreach (var pattern in new[]
                 {
                     @"<article[\s\S]*?</article>",
                     @"id=[""']content[""'][\s\S]{0,200}?>([\s\S]*?)</div>",
                     @"class=[""'][^""']*(?:article|content|main|detail)[^""']*[""'][^>]*>([\s\S]{500,}?)</div>",
                 })
        {
            var m = Regex.Match(html, pattern, RegexOptions.IgnoreCase);
            if (m.Success)
            {
                var chunk = m.Groups.Count > 1 && m.Groups[1].Success ? m.Groups[1].Value : m.Value;
                var text = ToPlainText(chunk);
                if (text.Length >= 200) return text;
            }
        }

        return ToPlainText(html);
    }

    public static string? FindFirstPdfUrl(string html, Uri pageUri)
    {
        var m = Regex.Match(
            html,
            @"https?://upload\.wikimedia\.org/[^""'\s>]+\.pdf",
            RegexOptions.IgnoreCase);
        if (m.Success) return m.Value;

        m = Regex.Match(html, @"href=[""']([^""']+\.pdf)[""']", RegexOptions.IgnoreCase);
        if (!m.Success) return null;
        var href = WebUtility.HtmlDecode(m.Groups[1].Value);
        if (Uri.TryCreate(pageUri, href, out var abs)) return abs.ToString();
        return null;
    }
}
