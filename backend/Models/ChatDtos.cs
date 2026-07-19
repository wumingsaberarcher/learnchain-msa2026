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
