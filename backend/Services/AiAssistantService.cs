using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace backend.Services;

public class AiAssistantService
{
    private const string DefaultBaseUrl = "https://api.openai.com/v1";
    private const string DefaultModel = "gpt-4o-mini";
    private const int MaxToolRounds = 4;

    private readonly AppDbContext _context;
    private readonly HabitContextBuilder _habitContext;
    private readonly CompanionMemoryService _memory;
    private readonly EmailService _email;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AiAssistantService> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public AiAssistantService(
        AppDbContext context,
        HabitContextBuilder habitContext,
        CompanionMemoryService memory,
        EmailService email,
        IHttpClientFactory httpClientFactory,
        ILogger<AiAssistantService> logger)
    {
        _context = context;
        _habitContext = habitContext;
        _memory = memory;
        _email = email;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<ChatResponse> ChatAsync(User user, ChatRequest request, CancellationToken ct = default)
    {
        var apiKey = request.ApiKey?.Trim();
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException(
                "API key is required. Add your OpenAI-compatible API key in Profile → AI Assistant settings.");

        var baseUrl = (request.BaseUrl?.Trim().TrimEnd('/') is { Length: > 0 } b ? b : DefaultBaseUrl);
        var model = string.IsNullOrWhiteSpace(request.Model) ? DefaultModel : request.Model.Trim();
        var zh = request.Language.StartsWith("zh", StringComparison.OrdinalIgnoreCase);

        var latestUser = request.Messages
            .LastOrDefault(m => m.Role == "user" && !string.IsNullOrWhiteSpace(m.Content));
        if (latestUser == null)
            throw new InvalidOperationException("A user message is required.");

        var session = await _memory.GetOrCreateSessionAsync(user.Id, ct);
        await _memory.AppendMessageAsync(session, "user", latestUser.Content, ct);

        var contextJson = await _habitContext.BuildContextJsonAsync(user);
        var memories = await _memory.GetRelevantMemoriesAsync(user.Id, latestUser.Content, ct: ct);
        var recent = await _memory.GetRecentActiveMessagesAsync(
            session.Id, CompanionMemoryService.ShortTermMessageLimit, ct);

        var systemPrompt = BuildSystemPrompt(zh, contextJson, session.Summary, memories);

        var messages = new JsonArray
        {
            new JsonObject { ["role"] = "system", ["content"] = systemPrompt }
        };

        foreach (var m in recent)
        {
            var role = m.Role is "assistant" or "user" ? m.Role : "user";
            if (string.IsNullOrWhiteSpace(m.Content)) continue;
            messages.Add(new JsonObject { ["role"] = role, ["content"] = m.Content.Trim() });
        }

        var actions = new List<ChatActionResult>();
        string? finalReply = null;

        for (var round = 0; round < MaxToolRounds; round++)
        {
            var body = new JsonObject
            {
                ["model"] = model,
                ["messages"] = messages,
                ["tools"] = BuildToolsSchema(),
                ["tool_choice"] = "auto",
                ["temperature"] = 0.4
            };

            var completion = await CallChatCompletionsAsync(baseUrl, apiKey, body, ct);
            var choice = completion["choices"]?[0]?["message"] as JsonObject
                ?? throw new InvalidOperationException("LLM returned an empty response.");

            messages.Add(SanitizeAssistantMessage(choice));

            var toolCalls = choice["tool_calls"] as JsonArray;
            if (toolCalls == null || toolCalls.Count == 0)
            {
                finalReply = ReadMessageContent(choice["content"])?.Trim();
                break;
            }

            foreach (var callNode in toolCalls)
            {
                if (callNode is not JsonObject call) continue;
                var id = ReadStringNode(call["id"]) ?? Guid.NewGuid().ToString("N");
                var name = ReadStringNode(call["function"]?["name"]) ?? "";
                var argsJson = ReadToolArguments(call["function"]?["arguments"]);

                var (resultText, action) = await ExecuteToolAsync(user, name, argsJson, zh, ct);
                if (action != null) actions.Add(action);

                messages.Add(new JsonObject
                {
                    ["role"] = "tool",
                    ["tool_call_id"] = id,
                    ["content"] = resultText
                });
            }
        }

        if (string.IsNullOrWhiteSpace(finalReply))
        {
            var body = new JsonObject
            {
                ["model"] = model,
                ["messages"] = messages,
                ["temperature"] = 0.4
            };
            var completion = await CallChatCompletionsAsync(baseUrl, apiKey, body, ct);
            finalReply = ReadMessageContent(completion["choices"]?[0]?["message"]?["content"])?.Trim()
                ?? (zh ? "我已经处理完相关操作，还有什么可以帮你的吗？" : "Done. Anything else I can help with?");
        }

        await _memory.AppendMessageAsync(session, "assistant", finalReply!, ct);
        try
        {
            await _memory.MaybeSummarizeAsync(session, user, apiKey, baseUrl, model, zh, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Companion summarize failed after chat; continuing with reply");
        }

        return new ChatResponse
        {
            Reply = finalReply!,
            ActionsExecuted = actions,
            SummaryUpdated = !string.IsNullOrWhiteSpace(session.Summary)
        };
    }

    private static string BuildSystemPrompt(
        bool zh,
        string contextJson,
        string rollingSummary,
        IReadOnlyList<UserMemory> memories)
    {
        var lang = zh ? "Simplified Chinese" : "English";
        var memoryBlock = memories.Count == 0
            ? "(none yet)"
            : string.Join("\n", memories.Select(m =>
                $"- [{m.Type}/{m.Key}] (importance {m.Importance}): {m.Content}"));

        var summaryBlock = string.IsNullOrWhiteSpace(rollingSummary)
            ? "(none yet — early in the relationship)"
            : rollingSummary;

        return $"""
            You are LearnChain's friendly habit coach companion — not just a tool.
            Always reply in {lang}.
            You remember the user across sessions via long-term memories and a rolling conversation summary.
            Naturally weave in game progress (streaks, XP, levels, badges, chain continuity) when helpful — keep it encouraging, not robotic.

            You help users understand their account, what they should do today, and create/rename/delete habits via tools.
            When creating a habit: if the user already said the essentials OR told you to decide freely (e.g. 随便 / any name / any XP), call create_habit immediately — pick a clear Daily name and difficulty 1–3. Do not keep asking clarifying questions when they said to choose for them.
            XP is determined by difficulty only (1→10 XP, 2→20 XP, 3→30 XP). If they ask for a specific XP, pick the closest difficulty. There is no free-form XP field.
            Otherwise ask briefly for missing name/type/difficulty, then call create_habit.
            When renaming or deleting, confirm the habit id/name first if ambiguous.
            You may read all account and habit data via tools or the context below.
            You cannot mark check-ins for the user; tell them to use the dashboard.
            You cannot change habit type or difficulty after creation — only rename, or create a new one.

            Current game / account state (JSON):
            {contextJson}

            Rolling conversation summary (older dialogue compressed):
            {summaryBlock}

            Long-term memories about this user (use gently; do not dump as a list unless asked):
            {memoryBlock}
            """;
    }

    private static JsonArray BuildToolsSchema() =>
    [
        Tool("get_account_overview", "Get account profile plus habit/today summary.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("get_today_status", "List habits due today and check-in status.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("list_habits", "List all active habits with ids and metadata.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("create_habit", "Create a new habit. Prefer calling this when the user wants you to invent name/XP. XP maps from difficulty: 1=10, 2=20, 3=30.", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["name"] = new JsonObject { ["type"] = "string", ["description"] = "Habit name (invent one if user said any/随便)" },
                ["habitType"] = new JsonObject { ["type"] = "string", ["description"] = "Daily | EveryOtherDay | Weekly | OneTime (default Daily)" },
                ["difficulty"] = new JsonObject { ["type"] = "integer", ["description"] = "1, 2, or 3" },
                ["xp"] = new JsonObject { ["type"] = "integer", ["description"] = "Optional requested XP; mapped to nearest difficulty" },
                ["dueDate"] = new JsonObject { ["type"] = "string", ["description"] = "ISO date optional, for Weekly/OneTime" }
            },
            ["required"] = new JsonArray("name")
        }),
        Tool("rename_habit", "Rename an existing habit by id.", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["habitId"] = new JsonObject { ["type"] = "integer" },
                ["newName"] = new JsonObject { ["type"] = "string" }
            },
            ["required"] = new JsonArray("habitId", "newName")
        }),
        Tool("delete_habit", "Soft-delete (deactivate) a habit by id.", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["habitId"] = new JsonObject { ["type"] = "integer" }
            },
            ["required"] = new JsonArray("habitId")
        }),
        Tool("send_today_reminder", "Email today's task summary to the user's registered email.", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject()
        })
    ];

    private static JsonObject Tool(string name, string description, JsonObject parameters) => new()
    {
        ["type"] = "function",
        ["function"] = new JsonObject
        {
            ["name"] = name,
            ["description"] = description,
            ["parameters"] = parameters
        }
    };

    private async Task<JsonNode> CallChatCompletionsAsync(string baseUrl, string apiKey, JsonObject body, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient("OpenAiCompatible");
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/chat/completions");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        req.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

        using var res = await client.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            _logger.LogWarning("LLM error {Status}: {Body}", (int)res.StatusCode, text);
            throw new InvalidOperationException($"LLM API error ({(int)res.StatusCode}): {Truncate(text, 400)}");
        }

        return JsonNode.Parse(text) ?? throw new InvalidOperationException("Invalid LLM JSON.");
    }

    private async Task<(string Result, ChatActionResult? Action)> ExecuteToolAsync(
        User user, string name, string argsJson, bool zh, CancellationToken ct)
    {
        JsonObject args;
        try
        {
            args = JsonNode.Parse(string.IsNullOrWhiteSpace(argsJson) ? "{}" : argsJson) as JsonObject ?? new JsonObject();
        }
        catch
        {
            args = new JsonObject();
        }

        try
        {
            switch (name)
            {
                case "get_account_overview":
                {
                    var json = await _habitContext.BuildContextJsonAsync(user);
                    return (json, null);
                }
                case "get_today_status":
                {
                    var habits = await _habitContext.GetActiveHabitsAsync(user.Id);
                    return (_habitContext.BuildTodayPlainText(habits, zh), null);
                }
                case "list_habits":
                {
                    var habits = await _habitContext.GetActiveHabitsAsync(user.Id);
                    var list = habits.Select(h => new
                    {
                        h.Id, h.Name, h.HabitType, h.Difficulty, h.CurrentStreak, h.IsDueToday, h.IsCheckedToday
                    });
                    return (JsonSerializer.Serialize(list, JsonOpts), null);
                }
                case "create_habit":
                {
                    var habitName = ReadStringArg(args, "name")?.Trim();
                    if (string.IsNullOrWhiteSpace(habitName))
                    {
                        habitName = zh ? $"每日小目标 {DateTime.UtcNow:MMddHHmm}" : $"Daily habit {DateTime.UtcNow:MMddHHmm}";
                    }

                    var habitTypeRaw = ReadStringArg(args, "habitType")?.Trim() ?? "Daily";
                    var habitType = NormalizeHabitType(habitTypeRaw);

                    var difficulty = ParseDifficulty(args["difficulty"]);
                    var xpHint = ParsePositiveInt(args["xp"]) ?? ParsePositiveInt(args["baseXp"]);
                    if (xpHint.HasValue)
                        difficulty = DifficultyFromXp(xpHint.Value);

                    DateTime? dueDate = null;
                    var dueRaw = ReadStringArg(args, "dueDate");
                    if (!string.IsNullOrWhiteSpace(dueRaw) && DateTime.TryParse(dueRaw, out var parsed))
                        dueDate = parsed.Date;

                    var exists = await _context.Habits.AnyAsync(h =>
                        h.UserId == user.Id && h.IsActive && h.Name.ToLower() == habitName.ToLower(), ct);
                    if (exists)
                    {
                        habitName = $"{habitName} {DateTime.UtcNow:HHmmss}";
                    }

                    var habit = new Habit
                    {
                        UserId = user.Id,
                        Name = habitName,
                        HabitType = habitType,
                        Frequency = HabitXpService.GetFrequencyLabel(habitType),
                        Difficulty = difficulty,
                        BaseXP = HabitXpService.GetBaseXP(difficulty),
                        DueDate = dueDate,
                        CompletionType = habitType == "OneTime" ? 1 : 0,
                        IsActive = true,
                        IsCompleted = false,
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.Habits.Add(habit);
                    await _context.SaveChangesAsync(ct);

                    var action = new ChatActionResult
                    {
                        Type = "habit_created",
                        Summary = zh
                            ? $"已创建习惯「{habit.Name}」（{habit.HabitType}，+{habit.BaseXP} XP）"
                            : $"Created habit \"{habit.Name}\" ({habit.HabitType}, +{habit.BaseXP} XP)",
                        HabitId = habit.Id
                    };
                    return (JsonSerializer.Serialize(new { ok = true, habit.Id, habit.Name, habit.HabitType, habit.Difficulty, habit.BaseXP }, JsonOpts), action);
                }
                case "rename_habit":
                {
                    var habitId = ParsePositiveInt(args["habitId"]) ?? 0;
                    var newName = ReadStringArg(args, "newName")?.Trim();
                    if (habitId <= 0 || string.IsNullOrWhiteSpace(newName))
                        return (zh ? "需要 habitId 和新名称" : "habitId and newName required", null);

                    var habit = await _context.Habits.FirstOrDefaultAsync(h => h.Id == habitId && h.UserId == user.Id && h.IsActive, ct);
                    if (habit == null)
                        return (zh ? "习惯不存在" : "Habit not found", null);

                    var conflict = await _context.Habits.AnyAsync(h =>
                        h.UserId == user.Id && h.IsActive && h.Id != habitId && h.Name.ToLower() == newName.ToLower(), ct);
                    if (conflict)
                        return (zh ? "已存在同名习惯" : "Name already taken", null);

                    var old = habit.Name;
                    habit.Name = newName;
                    await _context.SaveChangesAsync(ct);

                    var action = new ChatActionResult
                    {
                        Type = "habit_updated",
                        Summary = zh ? $"已将「{old}」改名为「{newName}」" : $"Renamed \"{old}\" to \"{newName}\"",
                        HabitId = habit.Id
                    };
                    return (JsonSerializer.Serialize(new { ok = true, habit.Id, habit.Name }, JsonOpts), action);
                }
                case "delete_habit":
                {
                    var habitId = ParsePositiveInt(args["habitId"]) ?? 0;
                    var habit = await _context.Habits.FirstOrDefaultAsync(h => h.Id == habitId && h.UserId == user.Id && h.IsActive, ct);
                    if (habit == null)
                        return (zh ? "习惯不存在" : "Habit not found", null);

                    habit.IsActive = false;
                    await _context.SaveChangesAsync(ct);

                    var action = new ChatActionResult
                    {
                        Type = "habit_deleted",
                        Summary = zh ? $"已删除习惯「{habit.Name}」" : $"Deleted habit \"{habit.Name}\"",
                        HabitId = habit.Id
                    };
                    return (JsonSerializer.Serialize(new { ok = true, habit.Id }, JsonOpts), action);
                }
                case "send_today_reminder":
                {
                    if (!_email.IsConfigured())
                        return (zh ? "服务器未配置 SMTP，无法发信" : "SMTP is not configured on the server", null);

                    if (string.IsNullOrWhiteSpace(user.Email))
                        return (zh ? "账户没有邮箱" : "Account has no email", null);

                    var habits = await _habitContext.GetActiveHabitsAsync(user.Id);
                    await _email.SendTodayDigestAsync(
                        user.Email,
                        user.Username,
                        habits.Select(h => (h.Name, h.IsCheckedToday, h.IsDueToday)),
                        zh ? "zh" : "en",
                        ct);

                    var action = new ChatActionResult
                    {
                        Type = "reminder_sent",
                        Summary = zh ? $"已发送今日提醒到 {user.Email}" : $"Sent today's reminder to {user.Email}"
                    };
                    return (JsonSerializer.Serialize(new { ok = true, to = user.Email }, JsonOpts), action);
                }
                default:
                    return ($"Unknown tool: {name}", null);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Tool {Tool} failed", name);
            return (zh ? $"工具执行失败：{ex.Message}" : $"Tool failed: {ex.Message}", null);
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..max] + "…";

    /// <summary>Strip null content from assistant tool-call messages — some providers reject Json null content.</summary>
    private static JsonObject SanitizeAssistantMessage(JsonObject choice)
    {
        var clone = choice.DeepClone()!.AsObject();
        if (clone.TryGetPropertyValue("content", out var content) &&
            (content is null || content.GetValueKind() == JsonValueKind.Null))
        {
            clone.Remove("content");
        }
        return clone;
    }

    private static string? ReadMessageContent(JsonNode? contentNode)
    {
        if (contentNode is null || contentNode.GetValueKind() == JsonValueKind.Null)
            return null;

        if (contentNode is JsonValue jv)
        {
            if (jv.TryGetValue<string>(out var s)) return s;
            return contentNode.ToString();
        }

        if (contentNode is JsonArray arr)
        {
            var parts = new List<string>();
            foreach (var part in arr)
            {
                if (part is JsonObject o)
                {
                    var text = ReadStringNode(o["text"]);
                    if (!string.IsNullOrEmpty(text)) parts.Add(text);
                }
                else if (part is JsonValue pv && pv.TryGetValue<string>(out var t) && !string.IsNullOrEmpty(t))
                {
                    parts.Add(t);
                }
            }
            return parts.Count == 0 ? null : string.Concat(parts);
        }

        return contentNode.ToString();
    }

    private static string? ReadStringNode(JsonNode? node)
    {
        if (node is null || node.GetValueKind() == JsonValueKind.Null) return null;
        if (node is JsonValue jv && jv.TryGetValue<string>(out var s)) return s;
        return node.ToString()?.Trim('"');
    }

    private static string ReadToolArguments(JsonNode? node)
    {
        if (node is null || node.GetValueKind() == JsonValueKind.Null) return "{}";
        if (node is JsonObject or JsonArray) return node.ToJsonString();
        if (node is JsonValue jv && jv.TryGetValue<string>(out var s))
            return string.IsNullOrWhiteSpace(s) ? "{}" : s;
        return node.ToString() ?? "{}";
    }

    private static string? ReadStringArg(JsonObject args, string key)
    {
        if (!args.TryGetPropertyValue(key, out var node) || node is null || node is JsonObject)
            return null;
        return ReadStringNode(node);
    }

    private static int? ParsePositiveInt(JsonNode? node)
    {
        if (node is null || node.GetValueKind() == JsonValueKind.Null) return null;
        try
        {
            if (node is JsonValue jv)
            {
                if (jv.TryGetValue<int>(out var i)) return i;
                if (jv.TryGetValue<long>(out var l)) return (int)l;
                if (jv.TryGetValue<double>(out var d)) return (int)Math.Round(d);
                if (jv.TryGetValue<string>(out var s) && int.TryParse(s.Trim(), out var p)) return p;
            }
            if (int.TryParse(node.ToString(), out var parsed)) return parsed;
        }
        catch
        {
            /* ignore */
        }
        return null;
    }

    private static int ParseDifficulty(JsonNode? node)
    {
        var n = ParsePositiveInt(node);
        if (n is >= 1 and <= 3) return n.Value;
        return 1;
    }

    private static int DifficultyFromXp(int xp) => xp switch
    {
        <= 14 => 1,
        <= 24 => 2,
        _ => 3
    };

    private static string NormalizeHabitType(string raw)
    {
        var t = raw.Trim();
        if (t is "Daily" or "EveryOtherDay" or "Weekly" or "OneTime") return t;
        var lower = t.ToLowerInvariant();
        if (lower is "daily" or "每天" or "每日") return "Daily";
        if (lower is "everyotherday" or "every_other_day" or "隔天" or "每两天") return "EveryOtherDay";
        if (lower is "weekly" or "每周") return "Weekly";
        if (lower is "onetime" or "one_time" or "一次性") return "OneTime";
        return "Daily";
    }
}
