namespace backend.Models;

public class CreateHabitRequest
{
    public string Name { get; set; } = string.Empty;
    public string HabitType { get; set; } = "Daily";
    public int Difficulty { get; set; } = 1;
    public DateTime? DueDate { get; set; }
    public List<CreateMilestoneRequest>? Milestones { get; set; }
    public bool AssessmentEnabled { get; set; }
    /// <summary>easy | medium | hard</summary>
    public string AssessmentDifficulty { get; set; } = "easy";
    /// <summary>Optional group to place the new habit into.</summary>
    public int? GroupId { get; set; }
}

public class CreateMilestoneRequest
{
    public string Title { get; set; } = string.Empty;
    public DateTime DueDate { get; set; }
    public int XPValue { get; set; }
    public int SortOrder { get; set; }
}

public class UpdateHabitRequest
{
    public string? Name { get; set; }
    public bool? AssessmentEnabled { get; set; }
    public string? AssessmentDifficulty { get; set; }
    /// <summary>When true, apply <see cref="GroupId"/> (null = leave group).</summary>
    public bool? SetGroupId { get; set; }
    public int? GroupId { get; set; }
}
