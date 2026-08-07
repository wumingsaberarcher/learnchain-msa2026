using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public class AssessmentService
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly CompanionAffectionService _affection;
    private readonly ILogger<AssessmentService> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public AssessmentService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory,
        CompanionAffectionService affection,
        ILogger<AssessmentService> logger)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _affection = affection;
        _logger = logger;
    }

    public async Task<(Habit Habit, string MaterialText)> LoadHabitContextAsync(
        int userId,
        int habitId,
        IReadOnlyList<int>? materialIds,
        CancellationToken ct)
    {
        var habit = await _db.Habits.FirstOrDefaultAsync(h => h.Id == habitId && h.UserId == userId, ct)
            ?? throw new InvalidOperationException("Habit not found.");

        var query = _db.HabitMaterials
            .Where(m => m.HabitId == habitId && m.UserId == userId && m.ExtractedText != "");

        if (materialIds is { Count: > 0 })
        {
            var idSet = materialIds.Where(id => id > 0).Distinct().ToList();
            if (idSet.Count > 0)
                query = query.Where(m => idSet.Contains(m.Id));
        }

        var materials = await query
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync(ct);

        if (materials.Count == 0)
            throw new InvalidOperationException(
                materialIds is { Count: > 0 }
                    ? "No usable text in the selected materials. Select files with extractable text."
                    : "No usable study materials. Upload at least one file with extractable text.");

        var combined = string.Join("\n\n---\n\n", materials.Select(m => $"[{m.FileName}]\n{m.ExtractedText}"));
        if (combined.Length > 28_000)
            combined = combined[..28_000];

        return (habit, combined);
    }

    public async Task<List<AssessmentQuestionDto>> GenerateAsync(
        User user,
        AssessmentGenerateRequest request,
        CancellationToken ct)
    {
        var apiKey = request.ApiKey?.Trim();
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("missing_api_key");

        var (habit, materialText) = await LoadHabitContextAsync(user.Id, request.HabitId, request.MaterialIds, ct);
        var difficulty = NormalizeDifficulty(habit.AssessmentDifficulty);
        var zh = (request.Language ?? "zh").StartsWith("zh", StringComparison.OrdinalIgnoreCase);
        var (count, allowShort) = difficulty switch
        {
            "hard" => (3, true),
            "medium" => (5, false),
            _ => (5, false)
        };

        var system = zh
            ? """
              你是严谨的出题老师。只根据提供的学习资料出题，不要编造资料外的事实。
              必须只输出一个 JSON 对象，不要 Markdown 代码块，格式：
              {"questions":[{"id":"q1","type":"mcq","prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correctOptionId":"a","maxScore":1}]}
              type 只能是 mcq 或 short。mcq 必须有 4 个 options 与 correctOptionId。
              short 题需要 referenceAnswer（参考要点）与 maxScore（建议 5）。
              """
            : """
              You are a strict quiz author. Use ONLY the provided study materials.
              Output a single JSON object (no markdown fences):
              {"questions":[{"id":"q1","type":"mcq","prompt":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correctOptionId":"a","maxScore":1}]}
              type is mcq or short. mcq needs 4 options and correctOptionId.
              short needs referenceAnswer and maxScore (suggest 5).
              """;

        var userPrompt = zh
            ? $"习惯：{habit.Name}\n难度：{difficulty}\n需要约 {count} 题。{(allowShort ? "可含问答题（short）。" : "以选择题（mcq）为主，至少 4 道 mcq。")}\n\n学习资料：\n{materialText}"
            : $"Habit: {habit.Name}\nDifficulty: {difficulty}\nAbout {count} questions. {(allowShort ? "May include short answers." : "Mostly mcq (at least 4).")}\n\nMaterials:\n{materialText}";

        var raw = await CallJsonAsync(request.BaseUrl, apiKey, request.Model, system, userPrompt, ct);
        var questions = ParseQuestions(raw, count, allowShort);
        if (questions.Count == 0)
            throw new InvalidOperationException("Failed to generate questions from the model.");

        return questions;
    }

    public async Task<object> GradeAsync(User user, AssessmentGradeRequest request, CancellationToken ct)
    {
        var apiKey = request.ApiKey?.Trim();
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("missing_api_key");

        var habit = await _db.Habits.FirstOrDefaultAsync(h => h.Id == request.HabitId && h.UserId == user.Id, ct)
            ?? throw new InvalidOperationException("Habit not found.");

        var difficulty = NormalizeDifficulty(
            string.IsNullOrWhiteSpace(request.Difficulty) ? habit.AssessmentDifficulty : request.Difficulty);

        var results = new List<AssessmentItemResultDto>();
        var zh = (request.Language ?? "zh").StartsWith("zh", StringComparison.OrdinalIgnoreCase);

        foreach (var answer in request.Answers)
        {
            var q = answer.Question;
            if (q == null)
            {
                results.Add(new AssessmentItemResultDto
                {
                    QuestionId = answer.QuestionId,
                    Correct = false,
                    Score = 0,
                    MaxScore = 1,
                    Explanation = zh ? "题目数据缺失" : "Missing question payload"
                });
                continue;
            }

            var type = (q.Type ?? answer.Type ?? "mcq").Trim().ToLowerInvariant();
            if (type == "short")
            {
                results.Add(await GradeShortAsync(apiKey, request.BaseUrl, request.Model, q, answer.TextAnswer ?? "", zh, ct));
            }
            else
            {
                var correctId = q.CorrectOptionId ?? "";
                var selected = answer.SelectedOptionId ?? "";
                var ok = !string.IsNullOrEmpty(correctId)
                         && string.Equals(selected, correctId, StringComparison.OrdinalIgnoreCase);
                results.Add(new AssessmentItemResultDto
                {
                    QuestionId = q.Id,
                    Correct = ok,
                    Score = ok ? Math.Max(1, q.MaxScore) : 0,
                    MaxScore = Math.Max(1, q.MaxScore),
                    CorrectOptionId = correctId,
                    Explanation = ok
                        ? (zh ? "回答正确。" : "Correct.")
                        : (zh ? $"正确答案是 {correctId.ToUpperInvariant()}。" : $"Correct option is {correctId.ToUpperInvariant()}.")
                });
            }
        }

        var total = results.Count;
        var correctCount = results.Count(r => r.Correct);
        var ratio = total == 0 ? 0 : (double)correctCount / total;
        var passed = difficulty switch
        {
            "hard" => total > 0 && correctCount == total,
            "medium" => ratio >= 0.5,
            _ => correctCount >= 1
        };

        var affectionDelta = 0;
        string? affectionTierKey = null;
        var points = user.CompanionAffection;
        var gainedToday = user.CompanionAffectionGainedToday;

        if (!passed)
        {
            var penalty = CompanionAffectionService.AssessmentFailPenalty(difficulty);
            var award = await _affection.PenaltyAsync(user, penalty, ct);
            affectionDelta = award.Awarded;
            points = award.Points;
            gainedToday = award.GainedToday;
            affectionTierKey = award.TierKey;
        }
        else
        {
            // Refresh snapshot without changing affection.
            points = user.CompanionAffection;
            gainedToday = user.CompanionAffectionGainedToday;
            var (_, tierKey, _) = CompanionAffectionService.ResolveTier(points);
            affectionTierKey = tierKey;
        }

        var summary = zh
            ? (passed
                ? $"考核通过！正确 {correctCount}/{total}。"
                : $"考核未达标（{correctCount}/{total}）。好感度 {affectionDelta}。")
            : (passed
                ? $"Passed! {correctCount}/{total} correct."
                : $"Did not pass ({correctCount}/{total}). Affection {affectionDelta}.");

        var critique = zh
            ? (passed
                ? "不错嘛，看来资料你有认真看过。继续保持。"
                : "嗯……这次不太行。打卡已经记下了，但好感度扣了。来，我把错的地方讲一遍。")
            : (passed
                ? "Not bad—you actually read the materials. Keep it up."
                : "Hmm… that wasn’t great. Check-in still counts, but affection dropped. Let’s review the misses.");

        return new
        {
            passed,
            difficulty,
            correctCount,
            total,
            ratio,
            summary,
            critique,
            results,
            affection = new
            {
                awarded = affectionDelta,
                points,
                tierKey = affectionTierKey,
                gainedToday,
                dailyCap = CompanionAffectionService.DailyCap
            }
        };
    }

    private async Task<AssessmentItemResultDto> GradeShortAsync(
        string apiKey,
        string? baseUrl,
        string? model,
        AssessmentQuestionDto q,
        string textAnswer,
        bool zh,
        CancellationToken ct)
    {
        var maxScore = q.MaxScore > 0 ? q.MaxScore : 5;
        if (string.IsNullOrWhiteSpace(textAnswer))
        {
            return new AssessmentItemResultDto
            {
                QuestionId = q.Id,
                Correct = false,
                Score = 0,
                MaxScore = maxScore,
                Explanation = zh ? "未作答。" : "No answer.",
                Deductions = [new AssessmentDeductionDto { Reason = zh ? "空白" : "Empty", Points = maxScore }]
            };
        }

        var system = zh
            ? """
              你是严格的阅卷老师。根据题目与参考答案给分。只输出 JSON（无 markdown）：
              {"score":0,"maxScore":5,"correct":false,"explanation":"...","highlights":[{"start":0,"end":5,"reason":"得分点"}],"deductions":[{"reason":"缺漏","points":1}]}
              highlights 的 start/end 是学生作答字符串的字符下标（半开区间 [start,end)）。
              correct 表示是否达到该题满分的 60% 及以上。
              """
            : """
              You are a strict grader. Output JSON only (no markdown):
              {"score":0,"maxScore":5,"correct":false,"explanation":"...","highlights":[{"start":0,"end":5,"reason":"credit"}],"deductions":[{"reason":"missing","points":1}]}
              highlights start/end are char indices into the student answer [start,end).
              correct means score >= 60% of maxScore.
              """;

        var userPrompt = zh
            ? $"题目：{q.Prompt}\n参考要点：{q.ReferenceAnswer}\n满分：{maxScore}\n学生作答：{textAnswer}"
            : $"Prompt: {q.Prompt}\nReference: {q.ReferenceAnswer}\nMax: {maxScore}\nAnswer: {textAnswer}";

        try
        {
            var raw = await CallJsonAsync(baseUrl, apiKey, model, system, userPrompt, ct);
            var node = JsonNode.Parse(StripFences(raw)) as JsonObject ?? new JsonObject();
            var score = node["score"]?.GetValue<double>() ?? 0;
            var max = node["maxScore"]?.GetValue<double>() ?? maxScore;
            if (max <= 0) max = maxScore;
            score = Math.Clamp(score, 0, max);
            var correct = node["correct"]?.GetValue<bool>() ?? (score >= max * 0.6);
            var explanation = node["explanation"]?.GetValue<string>() ?? "";
            var highlights = ParseHighlights(node["highlights"], textAnswer.Length);
            var deductions = ParseDeductions(node["deductions"]);

            return new AssessmentItemResultDto
            {
                QuestionId = q.Id,
                Correct = correct,
                Score = score,
                MaxScore = max,
                Explanation = explanation,
                Highlights = highlights,
                Deductions = deductions
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Short-answer grading failed");
            return new AssessmentItemResultDto
            {
                QuestionId = q.Id,
                Correct = false,
                Score = 0,
                MaxScore = maxScore,
                Explanation = zh ? "自动评分失败，请稍后重试。" : "Auto-grading failed."
            };
        }
    }

    private static List<AssessmentHighlightDto> ParseHighlights(JsonNode? node, int answerLen)
    {
        var list = new List<AssessmentHighlightDto>();
        if (node is not JsonArray arr) return list;
        foreach (var item in arr)
        {
            if (item is not JsonObject o) continue;
            var start = o["start"]?.GetValue<int>() ?? 0;
            var end = o["end"]?.GetValue<int>() ?? 0;
            if (start < 0) start = 0;
            if (end > answerLen) end = answerLen;
            if (end <= start) continue;
            list.Add(new AssessmentHighlightDto
            {
                Start = start,
                End = end,
                Reason = o["reason"]?.GetValue<string>() ?? ""
            });
        }
        return list;
    }

    private static List<AssessmentDeductionDto> ParseDeductions(JsonNode? node)
    {
        var list = new List<AssessmentDeductionDto>();
        if (node is not JsonArray arr) return list;
        foreach (var item in arr)
        {
            if (item is not JsonObject o) continue;
            list.Add(new AssessmentDeductionDto
            {
                Reason = o["reason"]?.GetValue<string>() ?? "",
                Points = o["points"]?.GetValue<int>() ?? 0
            });
        }
        return list;
    }

    private static List<AssessmentQuestionDto> ParseQuestions(string raw, int expectedCount, bool allowShort)
    {
        var text = StripFences(raw);
        JsonObject? root;
        try
        {
            root = JsonNode.Parse(text) as JsonObject;
        }
        catch
        {
            return [];
        }

        var arr = root?["questions"] as JsonArray;
        if (arr == null) return [];

        var list = new List<AssessmentQuestionDto>();
        var i = 0;
        foreach (var item in arr)
        {
            if (item is not JsonObject o) continue;
            i++;
            var typeRaw = (o["type"]?.GetValue<string>() ?? "mcq").Trim().ToLowerInvariant();
            var type = NormalizeQuestionType(typeRaw);

            var q = new AssessmentQuestionDto
            {
                Id = o["id"]?.GetValue<string>() ?? $"q{i}",
                Type = type,
                Prompt = o["prompt"]?.GetValue<string>() ?? "",
                CorrectOptionId = o["correctOptionId"]?.GetValue<string>()
                    ?? o["correct_option_id"]?.GetValue<string>(),
                ReferenceAnswer = o["referenceAnswer"]?.GetValue<string>()
                    ?? o["reference_answer"]?.GetValue<string>(),
                MaxScore = o["maxScore"]?.GetValue<int>()
                    ?? o["max_score"]?.GetValue<int>()
                    ?? (type == "short" ? 5 : 1)
            };

            var options = new List<AssessmentOptionDto>();
            if (o["options"] is JsonArray opts)
            {
                foreach (var opt in opts)
                {
                    if (opt is not JsonObject oo) continue;
                    var oid = oo["id"]?.GetValue<string>() ?? "";
                    var otext = oo["text"]?.GetValue<string>() ?? "";
                    if (string.IsNullOrWhiteSpace(oid) && string.IsNullOrWhiteSpace(otext)) continue;
                    if (string.IsNullOrWhiteSpace(oid)) oid = ((char)('a' + options.Count)).ToString();
                    options.Add(new AssessmentOptionDto { Id = oid, Text = otext });
                }
            }

            // MCQ without usable choices → treat as short so the UI always has an answer box.
            if (type == "mcq" && options.Count < 2)
                type = "short";

            // On easy/medium prefer MCQ when options exist; otherwise keep short rather than blank UI.
            if (type == "short" && !allowShort && options.Count >= 2)
                type = "mcq";

            q.Type = type;
            q.MaxScore = q.MaxScore > 0 ? q.MaxScore : (type == "short" ? 5 : 1);

            if (type == "mcq")
            {
                q.Options = options;
                if (string.IsNullOrWhiteSpace(q.CorrectOptionId) && options.Count > 0)
                    q.CorrectOptionId = options[0].Id;
            }
            else
            {
                q.Options = null;
                if (string.IsNullOrWhiteSpace(q.ReferenceAnswer))
                    q.ReferenceAnswer = o["answer"]?.GetValue<string>() ?? "";
            }

            if (!string.IsNullOrWhiteSpace(q.Prompt))
                list.Add(q);

            if (list.Count >= Math.Max(expectedCount, 3) + 2) break;
        }

        return list.Take(Math.Max(expectedCount, 1)).ToList();
    }

    private async Task<string> CallJsonAsync(
        string? baseUrl,
        string apiKey,
        string? model,
        string system,
        string userPrompt,
        CancellationToken ct)
    {
        var url = string.IsNullOrWhiteSpace(baseUrl) ? "https://api.openai.com/v1" : baseUrl.Trim().TrimEnd('/');
        if (!url.EndsWith("/v1", StringComparison.OrdinalIgnoreCase) && !url.Contains("/v1/", StringComparison.OrdinalIgnoreCase))
        {
            // keep as provided
        }

        var body = new JsonObject
        {
            ["model"] = string.IsNullOrWhiteSpace(model) ? "gpt-4o-mini" : model.Trim(),
            ["temperature"] = 0.4,
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
            _logger.LogWarning("Assessment LLM error {Status}: {Body}", (int)res.StatusCode, text);
            throw new InvalidOperationException($"LLM API error ({(int)res.StatusCode})");
        }

        var node = JsonNode.Parse(text) as JsonObject
            ?? throw new InvalidOperationException("Invalid LLM JSON.");
        var content = node["choices"]?[0]?["message"]?["content"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Empty LLM content.");
        return content;
    }

    private static string NormalizeQuestionType(string raw)
    {
        var t = (raw ?? "mcq").Trim().ToLowerInvariant();
        if (t is "short" or "short_answer" or "shortanswer" or "essay" or "qa" or "open" or "text"
            || t.Contains("short", StringComparison.Ordinal)
            || t.Contains("问答", StringComparison.Ordinal))
            return "short";
        return "mcq";
    }

    private static string StripFences(string raw)
    {
        var t = raw.Trim();
        if (t.StartsWith("```", StringComparison.Ordinal))
        {
            var firstNl = t.IndexOf('\n');
            if (firstNl > 0) t = t[(firstNl + 1)..];
            var end = t.LastIndexOf("```", StringComparison.Ordinal);
            if (end >= 0) t = t[..end];
        }
        return t.Trim();
    }

    private static string NormalizeDifficulty(string? value)
    {
        var v = (value ?? "easy").Trim().ToLowerInvariant();
        return v is "medium" or "hard" ? v : "easy";
    }
}
