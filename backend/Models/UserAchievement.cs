namespace backend.Models;

public class UserAchievement
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string BadgeId { get; set; } = string.Empty;
    public DateTime UnlockedAt { get; set; } = DateTime.UtcNow;
}
