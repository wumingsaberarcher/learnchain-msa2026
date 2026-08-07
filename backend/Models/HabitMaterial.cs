namespace backend.Models;

public class HabitMaterial
{
    public int Id { get; set; }
    public int HabitId { get; set; }
    public int UserId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    /// <summary>Relative path under materials root, or empty if text-only store.</summary>
    public string StoredPath { get; set; } = string.Empty;
    /// <summary>Extracted plain text used for quiz generation.</summary>
    public string ExtractedText { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
