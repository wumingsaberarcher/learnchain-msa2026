using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Habit> Habits { get; set; }
    public DbSet<CheckIn> CheckIns { get; set; }
    public DbSet<HabitMilestone> HabitMilestones { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<UserAchievement> UserAchievements { get; set; }
}