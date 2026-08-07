namespace backend.Models;

public class HabitGroupMaterial
{
    public int Id { get; set; }
    public int GroupId { get; set; }
    public int UserId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public string StoredPath { get; set; } = string.Empty;
    public string ExtractedText { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
