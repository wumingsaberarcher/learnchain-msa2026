using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Habit> Habits { get; set; }
    public DbSet<CheckIn> CheckIns { get; set; }   // 新增这一行
    public DbSet<User> Users { get; set; }
}