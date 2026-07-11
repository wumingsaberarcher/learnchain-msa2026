namespace backend.Models;

public class CreateHabitRequest
{
    public string Name { get; set; } = string.Empty;
    public string HabitType { get; set; } = "Daily";
    public int Difficulty { get; set; } = 1;
    public DateTime? DueDate { get; set; }
    public List<CreateMilestoneRequest>? Milestones { get; set; }
}

public class CreateMilestoneRequest
{
    public string Title { get; set; } = string.Empty;
    public DateTime DueDate { get; set; }
    public int XPValue { get; set; }
    public int SortOrder { get; set; }
}
