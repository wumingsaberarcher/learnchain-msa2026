using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using UglyToad.PdfPig;

namespace backend.Services;

public class HabitMaterialTextExtractor
{
    public const long MaxUploadBytes = 8 * 1024 * 1024;
    public const int MaxExtractedChars = 40_000;

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".docx", ".md", ".txt"
    };

    public bool IsAllowed(string fileName)
    {
        var ext = Path.GetExtension(fileName ?? "");
        return AllowedExtensions.Contains(ext);
    }

    public string DetectContentType(string fileName)
    {
        return Path.GetExtension(fileName ?? "").ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".md" => "text/markdown",
            ".txt" => "text/plain",
            _ => "application/octet-stream"
        };
    }

    public async Task<string> ExtractAsync(string fileName, Stream stream, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        return ext switch
        {
            ".txt" or ".md" => await ExtractPlainAsync(stream, ct),
            ".pdf" => ExtractPdf(stream),
            ".docx" => ExtractDocx(stream),
            _ => throw new InvalidOperationException("Unsupported file type. Use pdf, docx, md, or txt.")
        };
    }

    private static async Task<string> ExtractPlainAsync(Stream stream, CancellationToken ct)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var text = await reader.ReadToEndAsync(ct);
        return Truncate(Normalize(text));
    }

    private static string ExtractPdf(Stream stream)
    {
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        ms.Position = 0;
        var sb = new StringBuilder();
        using var doc = PdfDocument.Open(ms);
        foreach (var page in doc.GetPages())
        {
            sb.AppendLine(page.Text);
            if (sb.Length >= MaxExtractedChars) break;
        }
        return Truncate(Normalize(sb.ToString()));
    }

    private static string ExtractDocx(Stream stream)
    {
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        ms.Position = 0;
        using var word = WordprocessingDocument.Open(ms, false);
        var body = word.MainDocumentPart?.Document?.Body;
        if (body == null) return "";
        var sb = new StringBuilder();
        foreach (var para in body.Elements<Paragraph>())
        {
            sb.AppendLine(para.InnerText);
            if (sb.Length >= MaxExtractedChars) break;
        }
        return Truncate(Normalize(sb.ToString()));
    }

    private static string Normalize(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return "";
        var cleaned = text.Replace("\r\n", "\n").Replace('\r', '\n');
        while (cleaned.Contains("\n\n\n", StringComparison.Ordinal))
            cleaned = cleaned.Replace("\n\n\n", "\n\n", StringComparison.Ordinal);
        return cleaned.Trim();
    }

    private static string Truncate(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        return text.Length <= MaxExtractedChars ? text : text[..MaxExtractedChars];
    }
}
