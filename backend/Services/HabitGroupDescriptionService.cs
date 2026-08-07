using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public class HabitGroupDescriptionService
{
    private const int MaxMaterialChars = 12_000;
    private const int MaxChatChars = 6_000;
    private const int MaxDescriptionChars = 280;

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<HabitGroupDescriptionService> _logger;

    public HabitGroupDescriptionService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory,
        ILogger<HabitGroupDescriptionService> logger)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<(string Description, string SourceNote)> GenerateAsync(
        int userId,
        int groupId,
        GenerateGroupDescriptionRequest request,
        CancellationToken ct = default)
    {
        var apiKey = (request.ApiKey ?? "").Trim();
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("missing_api_key");

        var group = await _db.HabitGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && g.UserId == userId && g.IsActive, ct)
            ?? throw new InvalidOperationException("group_not_found");

        if (!request.Overwrite && !string.IsNullOrWhiteSpace(group.Description))
            throw new InvalidOperationException("description_exists");

        var materials = await _db.HabitGroupMaterials
            .Where(m => m.GroupId == groupId && m.UserId == userId && m.ExtractedText != "")
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new { m.FileName, m.ExtractedText })
            .ToListAsync(ct);

        var materialSb = new StringBuilder();
        foreach (var m in materials)
        {
            if (materialSb.Length >= MaxMaterialChars) break;
            materialSb.AppendLine($"### {m.FileName}");
            materialSb.AppendLine(Truncate(m.ExtractedText, 4000));
            materialSb.AppendLine();
        }

        // Optional client-side excerpts (e.g. local-only txt/md not yet synced).
        if (request.LocalExcerpts is { Count: > 0 })
        {
            foreach (var ex in request.LocalExcerpts)
            {
                if (materialSb.Length >= MaxMaterialChars) break;
                var name = string.IsNullOrWhiteSpace(ex.FileName) ? "local" : ex.FileName.Trim();
                var text = (ex.Text ?? "").Trim();
                if (text.Length == 0) continue;
                materialSb.AppendLine($"### {name} (local)");
                materialSb.AppendLine(Truncate(text, 3000));
                materialSb.AppendLine();
            }
        }

        if (materialSb.Length == 0)
            throw new InvalidOperationException("no_materials");

        var habitIds = await _db.Habits
            .Where(h => h.UserId == userId && h.IsActive && h.GroupId == groupId)
            .Select(h => new { h.Id, h.Name })
            .ToListAsync(ct);

        var chatSb = new StringBuilder();
        if (habitIds.Count > 0)
        {
            var ids = habitIds.Select(h => h.Id).ToList();
            var sessions = await _db.ChatSessions
                .Where(s => s.UserId == userId && s.ZoneType == ChatZones.Habit && ids.Contains(s.HabitId))
                .ToListAsync(ct);

            var nameById = habitIds.ToDictionary(h => h.Id, h => h.Name);
            foreach (var session in sessions)
            {
                if (chatSb.Length >= MaxChatChars) break;
                var habitName = nameById.GetValueOrDefault(session.HabitId, $"#{session.HabitId}");
                if (!string.IsNullOrWhiteSpace(session.Summary))
                {
                    chatSb.AppendLine($"## Habit「{habitName}」summary");
                    chatSb.AppendLine(Truncate(session.Summary, 800));
                    chatSb.AppendLine();
                }

                var recent = await _db.ChatMessages
                    .Where(m => m.SessionId == session.Id && !m.IsArchived)
                    .OrderByDescending(m => m.CreatedAt)
                    .Take(8)
                    .Select(m => new { m.Role, m.Content })
                    .ToListAsync(ct);
                recent.Reverse();
                if (recent.Count == 0) continue;
                chatSb.AppendLine($"## Habit「{habitName}」recent chat");
                foreach (var msg in recent)
                {
                    if (chatSb.Length >= MaxChatChars) break;
                    chatSb.AppendLine($"{msg.Role}: {Truncate(msg.Content, 400)}");
                }
                chatSb.AppendLine();
            }
        }

        var zh = string.Equals(request.Language, "zh", StringComparison.OrdinalIgnoreCase)
                 || string.IsNullOrWhiteSpace(request.Language);
        var system = zh
            ? "你是学习助手 Canal。根据用户提供的学习资料与习惯对话，为习惯组写一段简洁简介。只输出简介正文，不要标题、引号或解释。"
            : "You are Canal, a study companion. Write a concise habit-group description from the materials and chat. Output only the description text — no title, quotes, or preamble.";

        var userPrompt = new StringBuilder();
        userPrompt.AppendLine(zh
            ? $"习惯组名称：{group.Name}"
            : $"Habit group name: {group.Name}");
        userPrompt.AppendLine(zh
            ? "要求：1–3 句，说明这个组在学什么、资料主题；口语自然；不超过 120 字（中文）或 60 words（英文）。"
            : "Requirements: 1–3 sentences on what this group studies; natural tone; max ~60 words.");
        userPrompt.AppendLine();
        userPrompt.AppendLine(zh ? "## 组共享资料摘录" : "## Group materials");
        userPrompt.AppendLine(Truncate(materialSb.ToString(), MaxMaterialChars));
        if (chatSb.Length > 0)
        {
            userPrompt.AppendLine();
            userPrompt.AppendLine(zh ? "## 组内习惯对话摘录" : "## Habit chat excerpts");
            userPrompt.AppendLine(Truncate(chatSb.ToString(), MaxChatChars));
        }

        var raw = await CallLlmAsync(request.BaseUrl, apiKey, request.Model, system, userPrompt.ToString(), ct);
        var description = CleanDescription(raw);
        if (string.IsNullOrWhiteSpace(description))
            throw new InvalidOperationException("empty_llm");

        group.Description = description;
        await _db.SaveChangesAsync(ct);

        var note = chatSb.Length > 0
            ? (zh ? "已结合资料与习惯对话" : "Used materials and habit chat")
            : (zh ? "已根据组资料生成" : "Generated from group materials");
        return (description, note);
    }

    private async Task<string> CallLlmAsync(
        string? baseUrl,
        string apiKey,
        string? model,
        string system,
        string userPrompt,
        CancellationToken ct)
    {
        var url = string.IsNullOrWhiteSpace(baseUrl) ? "https://api.openai.com/v1" : baseUrl.Trim().TrimEnd('/');
        var body = new JsonObject
        {
            ["model"] = string.IsNullOrWhiteSpace(model) ? "gpt-4o-mini" : model.Trim(),
            ["temperature"] = 0.5,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "system", ["content"] = system },
                new JsonObject { ["role"] = "user", ["content"] = userPrompt }
            }
        };

        var client = _httpClientFactory.CreateClient("OpenAiCompatible");
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{url}/chat/completions");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        req.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

        using var res = await client.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            _logger.LogWarning("Group description LLM error {Status}: {Body}", (int)res.StatusCode, text);
            throw new InvalidOperationException($"LLM API error ({(int)res.StatusCode})");
        }

        var node = JsonNode.Parse(text) as JsonObject
            ?? throw new InvalidOperationException("Invalid LLM JSON.");
        return node["choices"]?[0]?["message"]?["content"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Empty LLM content.");
    }

    private static string CleanDescription(string raw)
    {
        var t = (raw ?? "").Trim();
        if (t.StartsWith("```", StringComparison.Ordinal))
        {
            var firstNl = t.IndexOf('\n');
            if (firstNl > 0) t = t[(firstNl + 1)..];
            var end = t.LastIndexOf("```", StringComparison.Ordinal);
            if (end >= 0) t = t[..end];
        }
        t = t.Trim().Trim('"', '“', '”', '\'');
        if (t.Length > MaxDescriptionChars)
            t = t[..MaxDescriptionChars].TrimEnd() + "…";
        return t;
    }

    private static string Truncate(string text, int max)
    {
        if (string.IsNullOrEmpty(text) || text.Length <= max) return text ?? "";
        return text[..max] + "…";
    }
}

public class GenerateGroupDescriptionRequest
{
    public string ApiKey { get; set; } = "";
    public string? BaseUrl { get; set; }
    public string? Model { get; set; }
    public string? Language { get; set; }
    public bool Overwrite { get; set; }
    public List<LocalExcerptDto>? LocalExcerpts { get; set; }
}

public class LocalExcerptDto
{
    public string? FileName { get; set; }
    public string? Text { get; set; }
}
