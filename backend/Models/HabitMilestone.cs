namespace backend.Models;

public class HabitMilestone
{
    public int Id { get; set; }
    public int HabitId { get; set; }
    public string Title { get; set; } = string.Empty;
    public DateTime DueDate { get; set; }
    public int XPValue { get; set; }
    public bool IsCompleted { get; set; }
    public int SortOrder { get; set; }
}
