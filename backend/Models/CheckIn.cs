namespace backend.Models;

public class CheckIn
{
    public int Id { get; set; }

    public int HabitId { get; set; }                    // 关联的习惯

    public int UserId { get; set; }                     // 记录所属用户

    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

    public int? Value { get; set; }                     // 计数型或时长型打卡时的数值

    public string? Notes { get; set; }                  // 备注

    public int XPEarned { get; set; }

    public int? MilestoneId { get; set; }
}