using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace backend.Services;

/// <summary>
/// Companion memory: short-term messages, rolling summary, structured long-term memories.
/// </summary>
public class CompanionMemoryService
{
    public const int ShortTermMessageLimit = 12;
    public const int SummarizeMessageThreshold = 16;
    public const int SummarizeTokenThreshold = 6000;
    public const int MemoryInjectLimit = 6;

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<CompanionMemoryService> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public CompanionMemoryService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory,
        ILogger<CompanionMemoryService> logger)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public static int EstimateTokens(string text) =>
        Math.Max(1, (int)Math.Ceiling((text?.Length ?? 0) / 4.0));

    public async Task<ChatSession> GetOrCreateSessionAsync(int userId, CancellationToken ct = default)
    {
        var session = await _db.ChatSessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.UpdatedAt)
            .FirstOrDefaultAsync(ct);

        if (session != null) return session;

        session = new ChatSession
        {
            UserId = userId,
            Summary = string.Empty,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.ChatSessions.Add(session);
        await _db.SaveChangesAsync(ct);
        return session;
    }

    public async Task<ChatMessage> AppendMessageAsync(
        ChatSession session, string role, string content, CancellationToken ct = default)
    {
        var msg = new ChatMessage
        {
            SessionId = session.Id,
            Role = role,
            Content = content.Trim(),
            TokenEstimate = EstimateTokens(content),
            IsArchived = false,
            CreatedAt = DateTime.UtcNow
        };
        _db.ChatMessages.Add(msg);
        session.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return msg;
    }

    public async Task<List<ChatMessage>> GetActiveMessagesAsync(int sessionId, CancellationToken ct = default) =>
        await _db.ChatMessages
            .Where(m => m.SessionId == sessionId && !m.IsArchived)
            .OrderBy(m => m.CreatedAt)
            .ThenBy(m => m.Id)
            .ToListAsync(ct);

    public async Task<List<ChatMessage>> GetRecentActiveMessagesAsync(
        int sessionId, int limit, CancellationToken ct = default)
    {
        var recent = await _db.ChatMessages
            .Where(m => m.SessionId == sessionId && !m.IsArchived)
            .OrderByDescending(m => m.CreatedAt)
            .ThenByDescending(m => m.Id)
            .Take(limit)
            .ToListAsync(ct);
        recent.Reverse();
        return recent;
    }

    public async Task<List<UserMemory>> GetRelevantMemoriesAsync(
        int userId, string? latestUserText, int limit = MemoryInjectLimit, CancellationToken ct = default)
    {
        var memories = await _db.UserMemories
            .Where(m => m.UserId == userId && !m.IsDeleted)
            .ToListAsync(ct);

        if (memories.Count == 0) return memories;

        var terms = ExtractTerms(latestUserText);
        IEnumerable<UserMemory> ranked = memories
            .Select(m => new
            {
                Memory = m,
                Score = m.Importance * 10
                    + (terms.Count == 0 ? 0 : terms.Count(t =>
                        m.Key.Contains(t, StringComparison.OrdinalIgnoreCase)
                        || m.Content.Contains(t, StringComparison.OrdinalIgnoreCase)) * 5)
                    + Math.Min(5, (int)(DateTime.UtcNow - m.LastAccessedAt).TotalDays * -0.1)
            })
            .OrderByDescending(x => x.Score)
            .ThenByDescending(x => x.Memory.Importance)
            .ThenByDescending(x => x.Memory.LastAccessedAt)
            .Select(x => x.Memory)
            .Take(limit);

        var picked = ranked.ToList();
        var now = DateTime.UtcNow;
        foreach (var m in picked)
            m.LastAccessedAt = now;
        if (picked.Count > 0)
            await _db.SaveChangesAsync(ct);

        return picked;
    }

    public async Task<List<UserMemory>> ListMemoriesAsync(int userId, CancellationToken ct = default) =>
        await _db.UserMemories
            .Where(m => m.UserId == userId && !m.IsDeleted)
            .OrderByDescending(m => m.Importance)
            .ThenByDescending(m => m.UpdatedAt)
            .ToListAsync(ct);

    public async Task<bool> SoftDeleteMemoryAsync(int userId, int memoryId, CancellationToken ct = default)
    {
        var m = await _db.UserMemories.FirstOrDefaultAsync(x => x.Id == memoryId && x.UserId == userId, ct);
        if (m == null) return false;
        m.IsDeleted = true;
        m.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>Clear short-term + summary (keep long-term memories and game data).</summary>
    public async Task ResetConversationAsync(int userId, CancellationToken ct = default)
    {
        var sessions = await _db.ChatSessions.Where(s => s.UserId == userId).ToListAsync(ct);
        var sessionIds = sessions.Select(s => s.Id).ToList();
        if (sessionIds.Count > 0)
        {
            var msgs = await _db.ChatMessages.Where(m => sessionIds.Contains(m.SessionId)).ToListAsync(ct);
            _db.ChatMessages.RemoveRange(msgs);
            _db.ChatSessions.RemoveRange(sessions);
        }
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Clear conversation + long-term memories.</summary>
    public async Task ResetAllMemoryAsync(int userId, CancellationToken ct = default)
    {
        await ResetConversationAsync(userId, ct);
        var memories = await _db.UserMemories.Where(m => m.UserId == userId).ToListAsync(ct);
        _db.UserMemories.RemoveRange(memories);
        await _db.SaveChangesAsync(ct);
    }

    public bool ShouldSummarize(IReadOnlyList<ChatMessage> activeMessages)
    {
        if (activeMessages.Count >= SummarizeMessageThreshold) return true;
        var tokens = activeMessages.Sum(m => m.TokenEstimate);
        return tokens >= SummarizeTokenThreshold;
    }

    public async Task MaybeSummarizeAsync(
        ChatSession session,
        User user,
        string apiKey,
        string baseUrl,
        string model,
        bool zh,
        CancellationToken ct = default)
    {
        var active = await GetActiveMessagesAsync(session.Id, ct);
        if (!ShouldSummarize(active)) return;

        var keep = active.TakeLast(ShortTermMessageLimit).ToList();
        var toArchive = active.Except(keep).ToList();
        if (toArchive.Count == 0) return;

        try
        {
            var result = await RunSummarizeLlmAsync(
                session.Summary,
                toArchive,
                apiKey,
                baseUrl,
                model,
                zh,
                ct);

            if (!string.IsNullOrWhiteSpace(result.Summary))
                session.Summary = result.Summary.Trim();

            foreach (var mem in result.Memories)
                await UpsertMemoryAsync(user.Id, mem, ct);

            foreach (var msg in toArchive)
                msg.IsArchived = true;

            session.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            _logger.LogInformation(
                "Summarized chat for user {UserId}: archived {Count} msgs, upserted {Mem} memories",
                user.Id, toArchive.Count, result.Memories.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Chat summarize failed for user {UserId}; continuing without archive", user.Id);
        }
    }

    private async Task UpsertMemoryAsync(int userId, MemoryUpsertDto dto, CancellationToken ct)
    {
        var type = NormalizeType(dto.Type);
        var key = (dto.Key ?? "").Trim();
        var content = (dto.Content ?? "").Trim();
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(content))
            return;

        var importance = dto.Importance is >= 1 and <= 5 ? dto.Importance : 3;
        var existing = await _db.UserMemories.FirstOrDefaultAsync(m =>
            m.UserId == userId && !m.IsDeleted && m.Type == type && m.Key == key, ct);

        if (existing != null)
        {
            existing.Content = content;
            existing.Importance = Math.Max(existing.Importance, importance);
            existing.UpdatedAt = DateTime.UtcNow;
            existing.LastAccessedAt = DateTime.UtcNow;
        }
        else
        {
            _db.UserMemories.Add(new UserMemory
            {
                UserId = userId,
                Type = type,
                Key = key.Length > 120 ? key[..120] : key,
                Content = content.Length > 2000 ? content[..2000] : content,
                Importance = importance,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                LastAccessedAt = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync(ct);
    }

    private static string NormalizeType(string? type)
    {
        var t = (type ?? "").Trim().ToLowerInvariant();
        return t switch
        {
            MemoryTypes.Preference => MemoryTypes.Preference,
            MemoryTypes.Event => MemoryTypes.Event,
            MemoryTypes.Relationship => MemoryTypes.Relationship,
            _ => MemoryTypes.Fact
        };
    }

    private async Task<SummarizeResult> RunSummarizeLlmAsync(
        string currentSummary,
        List<ChatMessage> olderMessages,
        string apiKey,
        string baseUrl,
        string model,
        bool zh,
        CancellationToken ct)
    {
        var transcript = string.Join("\n", olderMessages.Select(m => $"{m.Role}: {m.Content}"));
        var system = """
            You are a memory compressor for LearnChain's habit companion.
            Update the rolling conversation summary and extract durable memories.
            Reply with ONLY valid JSON (no markdown), shape:
            {
              "summary": "updated rolling summary text",
              "memories_to_upsert": [
                { "type": "preference|fact|event|relationship", "key": "short_key", "content": "detail", "importance": 1 }
              ]
            }
            Keep summary concise but retain: preferences, important facts, emotional tone, key events/timeline.
            Prefer at most 5 memories. importance is 1-5.
            """;

        var userContent = $"""
            Language preference: {(zh ? "Chinese ok in summary/memories if user spoke Chinese" : "English")}
            Current summary:
            {(string.IsNullOrWhiteSpace(currentSummary) ? "(empty)" : currentSummary)}

            Older messages to fold in:
            {transcript}
            """;

        var body = new JsonObject
        {
            ["model"] = model,
            ["temperature"] = 0.2,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "system", ["content"] = system },
                new JsonObject { ["role"] = "user", ["content"] = userContent }
            }
        };

        var client = _httpClientFactory.CreateClient("OpenAiCompatible");
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        req.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

        using var res = await client.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Summarize LLM error ({(int)res.StatusCode}): {text[..Math.Min(200, text.Length)]}");

        var root = JsonNode.Parse(text);
        var content = root?["choices"]?[0]?["message"]?["content"]?.GetValue<string>() ?? "";
        return ParseSummarizeJson(content, currentSummary);
    }

    private static SummarizeResult ParseSummarizeJson(string content, string fallbackSummary)
    {
        var json = ExtractJsonObject(content);
        if (json == null)
            return new SummarizeResult { Summary = fallbackSummary };

        try
        {
            var parsed = JsonSerializer.Deserialize<SummarizeLlmDto>(json, JsonOpts);
            return new SummarizeResult
            {
                Summary = parsed?.Summary?.Trim() ?? fallbackSummary,
                Memories = parsed?.MemoriesToUpsert ?? new List<MemoryUpsertDto>()
            };
        }
        catch
        {
            return new SummarizeResult { Summary = fallbackSummary };
        }
    }

    private static string? ExtractJsonObject(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return null;
        var trimmed = content.Trim();
        if (trimmed.StartsWith("```"))
        {
            var match = Regex.Match(trimmed, "```(?:json)?\\s*([\\s\\S]*?)```", RegexOptions.IgnoreCase);
            if (match.Success) trimmed = match.Groups[1].Value.Trim();
        }
        var start = trimmed.IndexOf('{');
        var end = trimmed.LastIndexOf('}');
        if (start < 0 || end <= start) return null;
        return trimmed[start..(end + 1)];
    }

    private static HashSet<string> ExtractTerms(string? text)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(text)) return set;
        foreach (Match m in Regex.Matches(text.ToLowerInvariant(), @"[\p{L}\p{N}]{2,}"))
        {
            if (m.Value.Length >= 2) set.Add(m.Value);
            if (set.Count >= 24) break;
        }
        return set;
    }

    private sealed class SummarizeLlmDto
    {
        [System.Text.Json.Serialization.JsonPropertyName("summary")]
        public string? Summary { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("memories_to_upsert")]
        public List<MemoryUpsertDto>? MemoriesToUpsert { get; set; }
    }

    public sealed class MemoryUpsertDto
    {
        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string? Type { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("key")]
        public string? Key { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("content")]
        public string? Content { get; set; }

        [System.Text.Json.Serialization.JsonPropertyName("importance")]
        public int Importance { get; set; } = 3;
    }

    public sealed class SummarizeResult
    {
        public string Summary { get; set; } = string.Empty;
        public List<MemoryUpsertDto> Memories { get; set; } = new();
    }
}
