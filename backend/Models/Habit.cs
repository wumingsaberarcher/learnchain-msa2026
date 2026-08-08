namespace backend.Models;

using System.ComponentModel.DataAnnotations.Schema;

public class Habit
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Frequency { get; set; } = string.Empty;
    public string HabitType { get; set; } = "Daily";
    public int Difficulty { get; set; } = 1;
    public DateTime? DueDate { get; set; }
    public bool IsCompleted { get; set; }
    public int CompletionType { get; set; }
    public int? TargetValue { get; set; }
    public int BaseXP { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }

    /// <summary>When true, Canal opens a quiz after a successful check-in.</summary>
    public bool AssessmentEnabled { get; set; }

    /// <summary>easy | medium | hard</summary>
    public string AssessmentDifficulty { get; set; } = "easy";

    /// <summary>Optional habit group membership; null = ungrouped.</summary>
    public int? GroupId { get; set; }

    /// <summary>Provenance: null = user/AI normal; "canal_curriculum" = Canal teaching task.</summary>
    public string? Source { get; set; }

    /// <summary>When Source is canal_curriculum, the lesson id from the curriculum catalog.</summary>
    public string? CurriculumLessonId { get; set; }

    [NotMapped]
    public int CurrentStreak { get; set; }

    [NotMapped]
    public bool IsCheckedToday { get; set; }

    [NotMapped]
    public bool IsDueToday { get; set; }

    [NotMapped]
    public List<HabitMilestone> Milestones { get; set; } = new();
}