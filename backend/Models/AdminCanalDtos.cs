namespace backend.Models;

public class AdminCanalBondDto
{
    /// <summary>Curriculum stage 0–4.</summary>
    public int? TrustLevel { get; set; }

    /// <summary>Companion affection points (0–MaxPoints).</summary>
    public int? CompanionAffection { get; set; }

    /// <summary>Optional replace of curriculum JSON; if null, leave unchanged.</summary>
    public string? CurriculumStateJson { get; set; }

    /// <summary>Reset today's inject counter.</summary>
    public bool? ResetInjectToday { get; set; }

    /// <summary>Force refresh CanalEvaluation after write.</summary>
    public bool RefreshEvaluation { get; set; } = true;
}

public class AdminCanalKnowledgeDto
{
    public string? EntryKey { get; set; }
    public string Category { get; set; } = "custom";
    public string TitleZh { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public string BodyZh { get; set; } = "";
    public string BodyEn { get; set; } = "";
    public int MinTrustLevel { get; set; }
    public string Section { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
