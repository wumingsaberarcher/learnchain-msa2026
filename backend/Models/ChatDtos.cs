namespace backend.Models;

public class ChatMessageDto
{
    public string Role { get; set; } = "user";
    public string Content { get; set; } = string.Empty;
}

public class ChatRequest
{
    public List<ChatMessageDto> Messages { get; set; } = new();
    public string Language { get; set; } = "zh";
    /// <summary>User-provided OpenAI-compatible API key (never stored server-side).</summary>
    public string? ApiKey { get; set; }
    /// <summary>Defaults to https://api.openai.com/v1</summary>
    public string? BaseUrl { get; set; }
    /// <summary>Defaults to gpt-4o-mini</summary>
    public string? Model { get; set; }
    /// <summary>daily | habit</summary>
    public string? ZoneType { get; set; }
    /// <summary>Required when ZoneType is habit.</summary>
    public int? HabitId { get; set; }
    /// <summary>Optional image as data URL (data:image/jpeg;base64,...).</summary>
    public string? ImageDataUrl { get; set; }
    /// <summary>Optional raw base64 (preferred over ImageDataUrl for large payloads).</summary>
    public string? ImageBase64 { get; set; }
    /// <summary>MIME for ImageBase64, e.g. image/jpeg.</summary>
    public string? ImageMime { get; set; }
}

public class ChatActionResult
{
    public string Type { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public int? HabitId { get; set; }
}

public class ChatResponse
{
    public string Reply { get; set; } = string.Empty;
    public List<ChatActionResult> ActionsExecuted { get; set; } = new();
    public bool SummaryUpdated { get; set; }
    public int? AffectionAwarded { get; set; }
    public int? AffectionPoints { get; set; }
    public string? AffectionTierKey { get; set; }
}

public class ChatHistoryMessageDto
{
    public string Role { get; set; } = "user";
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class ChatHistoryResponse
{
    public string Summary { get; set; } = string.Empty;
    public List<ChatHistoryMessageDto> Messages { get; set; } = new();
}

public class UserMemoryDto
{
    public int Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public int Importance { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string ZoneType { get; set; } = ChatZones.Daily;
    public int HabitId { get; set; }
}

public class ChatPreferencesDto
{
    public bool DailyDigestEnabled { get; set; }
}

public class ReminderResponse
{
    public bool Sent { get; set; }
    public string Message { get; set; } = string.Empty;
}
