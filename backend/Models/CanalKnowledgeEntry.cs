namespace backend.Models;

/// <summary>
/// Canal companion knowledge base entry (identity / lore / doctrine sources / custom).
/// SuperAdmin CRUD; builtin seeds are re-activated on migrate but body can be edited.
/// </summary>
public class CanalKnowledgeEntry
{
    public int Id { get; set; }

    /// <summary>Stable key for seed upsert, e.g. identity.alpha-core or source.atp-3-21.71-2024</summary>
    public string EntryKey { get; set; } = "";

    /// <summary>identity | lore | source | portal | custom</summary>
    public string Category { get; set; } = "custom";

    public string TitleZh { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public string BodyZh { get; set; } = "";
    public string BodyEn { get; set; } = "";

    /// <summary>Minimum curriculum TrustLevel (0–4) before Canal may use this in prompts.</summary>
    public int MinTrustLevel { get; set; }

    /// <summary>Literature section tag, e.g. 7.1 / 8</summary>
    public string Section { get; set; } = "";

    public bool IsBuiltin { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
