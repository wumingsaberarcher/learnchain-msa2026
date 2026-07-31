namespace backend.Models;

public class ChatSession
{
    public int Id { get; set; }
    public int UserId { get; set; }
    /// <summary>Rolling summary of older conversation (L2).</summary>
    public string Summary { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class ChatMessage
{
    public int Id { get; set; }
    public int SessionId { get; set; }
    public string Role { get; set; } = "user"; // user | assistant | system
    public string Content { get; set; } = string.Empty;
    public int TokenEstimate { get; set; }
    public bool IsArchived { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class MemoryTypes
{
    public const string Preference = "preference";
    public const string Fact = "fact";
    public const string Event = "event";
    public const string Relationship = "relationship";
}

public class UserMemory
{
    public int Id { get; set; }
    public int UserId { get; set; }
    /// <summary>preference | fact | event | relationship</summary>
    public string Type { get; set; } = MemoryTypes.Fact;
    public string Key { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    /// <summary>1–5 importance.</summary>
    public int Importance { get; set; } = 3;
    public bool IsDeleted { get; set; }
    public DateTime LastAccessedAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
