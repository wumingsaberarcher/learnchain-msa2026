namespace backend.Models;

/// <summary>
/// Canal (凯娜尔) knowledge base entry.
/// Categories: identity | military | other
/// </summary>
public class CanalKnowledgeEntry
{
    public int Id { get; set; }

    /// <summary>Stable key for seed upsert, e.g. identity.alpha-core or source.atp-3-21.71-2024</summary>
    public string EntryKey { get; set; } = "";

    /// <summary>identity = 角色身份; military = 军事知识贮备; other = 其他</summary>
    public string Category { get; set; } = "other";

    public string TitleZh { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public string BodyZh { get; set; } = "";
    public string BodyEn { get; set; } = "";

    /// <summary>Full text extracted from uploaded PDF/docx/md/txt (Canal may recall via prompt + search).</summary>
    public string ExtractedText { get; set; } = "";

    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long FileSize { get; set; }
    public string StoredPath { get; set; } = "";

    /// <summary>Minimum curriculum TrustLevel (0–4) before Canal may use this in prompts.</summary>
    public int MinTrustLevel { get; set; }

    /// <summary>Literature section tag, e.g. 7.1 / 8 / lore</summary>
    public string Section { get; set; } = "";

    public bool IsBuiltin { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
