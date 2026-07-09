namespace backend.Models;

using System.ComponentModel.DataAnnotations.Schema;

public class Habit
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Frequency { get; set; } = string.Empty;
    public int CompletionType { get; set; }
    public int? TargetValue { get; set; }
    public int BaseXP { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }

    // 当前连击天数（不映射到数据库）
    [NotMapped]
    public int CurrentStreak { get; set; }

    // 是否今日已打卡（不映射到数据库）
    [NotMapped]
    public bool IsCheckedToday { get; set; }
}