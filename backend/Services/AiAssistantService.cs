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
        EmailService email,
        IHttpClientFactory httpClientFactory,
        ILogger<AiAssistantService> logger)
    {
        _context = context;
        _habitContext = habitContext;
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

        var contextJson = await _habitContext.BuildContextJsonAsync(user);
        var systemPrompt = BuildSystemPrompt(zh, contextJson);

        var messages = new JsonArray
        {
            new JsonObject { ["role"] = "system", ["content"] = systemPrompt }
        };

        foreach (var m in request.Messages.TakeLast(24))
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

            messages.Add(choice.DeepClone());

            var toolCalls = choice["tool_calls"] as JsonArray;
            if (toolCalls == null || toolCalls.Count == 0)
            {
                finalReply = choice["content"]?.GetValue<string>()?.Trim();
                break;
            }

            foreach (var callNode in toolCalls)
            {
                if (callNode is not JsonObject call) continue;
                var id = call["id"]?.GetValue<string>() ?? Guid.NewGuid().ToString("N");
                var name = call["function"]?["name"]?.GetValue<string>() ?? "";
                var argsJson = call["function"]?["arguments"]?.GetValue<string>() ?? "{}";

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
            // One more pass without tools if we exhausted rounds mid-tool-loop
            var body = new JsonObject
            {
                ["model"] = model,
                ["messages"] = messages,
                ["temperature"] = 0.4
            };
            var completion = await CallChatCompletionsAsync(baseUrl, apiKey, body, ct);
            finalReply = completion["choices"]?[0]?["message"]?["content"]?.GetValue<string>()?.Trim()
                ?? (zh ? "我已经处理完相关操作，还有什么可以帮你的吗？" : "Done. Anything else I can help with?");
        }

        return new ChatResponse
        {
            Reply = finalReply!,
            ActionsExecuted = actions
        };
    }

    private static string BuildSystemPrompt(bool zh, string contextJson)
    {
        var lang = zh ? "Simplified Chinese" : "English";
        return $"""
            You are LearnChain's friendly habit coach assistant.
            Always reply in {lang}.

            You help users understand their account, what they should do today, and create/rename/delete habits via tools.
            When creating a habit, ask clarifying questions (name, type: Daily|EveryOtherDay|Weekly|OneTime, difficulty 1-3, due date for OneTime/Weekly if needed) until you have enough info — then call create_habit.
            When renaming or deleting, confirm the habit id/name first if ambiguous.
            You may read all account and habit data via tools or the context below.
            You cannot mark check-ins for the user; tell them to use the dashboard.
            You cannot change habit type or difficulty after creation — only rename, or create a new one.

            Current user context (JSON):
            {contextJson}
            """;
    }

    private static JsonArray BuildToolsSchema() =>
    [
        Tool("get_account_overview", "Get account profile plus habit/today summary.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("get_today_status", "List habits due today and check-in status.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("list_habits", "List all active habits with ids and metadata.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("create_habit", "Create a new habit after gathering details.", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["name"] = new JsonObject { ["type"] = "string" },
                ["habitType"] = new JsonObject { ["type"] = "string", ["description"] = "Daily | EveryOtherDay | Weekly | OneTime" },
                ["difficulty"] = new JsonObject { ["type"] = "integer", ["description"] = "1, 2, or 3" },
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
                    var habitName = args["name"]?.GetValue<string>()?.Trim();
                    if (string.IsNullOrWhiteSpace(habitName))
                        return (zh ? "缺少习惯名称" : "Missing habit name", null);

                    var habitType = args["habitType"]?.GetValue<string>()?.Trim() ?? "Daily";
                    if (habitType is not ("Daily" or "EveryOtherDay" or "Weekly" or "OneTime"))
                        habitType = "Daily";

                    var difficulty = 1;
                    if (args["difficulty"] != null)
                    {
                        difficulty = args["difficulty"]!.GetValue<int>();
                        if (difficulty is < 1 or > 3) difficulty = 1;
                    }

                    DateTime? dueDate = null;
                    if (args["dueDate"] != null && DateTime.TryParse(args["dueDate"]!.ToString(), out var parsed))
                        dueDate = parsed.Date;

                    var exists = await _context.Habits.AnyAsync(h =>
                        h.UserId == user.Id && h.IsActive && h.Name.ToLower() == habitName.ToLower(), ct);
                    if (exists)
                        return (zh ? "已存在同名活跃习惯" : "An active habit with that name already exists", null);

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
                        Summary = zh ? $"已创建习惯「{habit.Name}」" : $"Created habit \"{habit.Name}\"",
                        HabitId = habit.Id
                    };
                    return (JsonSerializer.Serialize(new { ok = true, habit.Id, habit.Name, habit.HabitType, habit.Difficulty }, JsonOpts), action);
                }
                case "rename_habit":
                {
                    var habitId = args["habitId"]?.GetValue<int>() ?? 0;
                    var newName = args["newName"]?.GetValue<string>()?.Trim();
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
                    var habitId = args["habitId"]?.GetValue<int>() ?? 0;
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
}
