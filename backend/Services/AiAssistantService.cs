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
    private readonly KnowledgeRetrievalService _knowledge;
    private readonly EmailService _email;
    private readonly CanalTrustService _trust;
    private readonly CanalKnowledgeService _canalKnowledge;
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
        KnowledgeRetrievalService knowledge,
        EmailService email,
        CanalTrustService trust,
        CanalKnowledgeService canalKnowledge,
        IHttpClientFactory httpClientFactory,
        ILogger<AiAssistantService> logger)
    {
        _context = context;
        _habitContext = habitContext;
        _memory = memory;
        _knowledge = knowledge;
        _email = email;
        _trust = trust;
        _canalKnowledge = canalKnowledge;
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
            .LastOrDefault(m => m.Role == "user");
        var userText = latestUser?.Content?.Trim() ?? "";
        string? imageDataUrl = null;
        var hasImageInput = !string.IsNullOrWhiteSpace(request.ImageDataUrl)
            || !string.IsNullOrWhiteSpace(request.ImageBase64);
        if (hasImageInput)
        {
            if (!ChatImageHelper.TryParse(
                    request.ImageDataUrl,
                    request.ImageBase64,
                    request.ImageMime,
                    out var mime,
                    out var b64,
                    out var imgErr))
            {
                var soft = VisionModelGuide.BuildImageSoftFailReply(zh, imgErr);
                var sessionFail = await _memory.GetOrCreateSessionAsync(user.Id, request.ZoneType, request.HabitId, ct);
                var failStore = string.IsNullOrWhiteSpace(userText)
                    ? (zh ? "[图片]" : "[Image]")
                    : $"{(zh ? "[图片]" : "[Image]")} {userText}";
                await _memory.AppendMessageAsync(sessionFail, "user", failStore, ct);
                await _memory.AppendMessageAsync(sessionFail, "assistant", soft, ct);
                return new ChatResponse { Reply = soft, ActionsExecuted = [] };
            }

            imageDataUrl = ChatImageHelper.NormalizeDataUrl(mime, b64);

            // Don't throw a cold 400 — Canal diagnoses the model in-character.
            if (VisionModelGuide.Classify(model) == VisionModelGuide.VisionCapability.LikelyNo)
            {
                var diagnosis = VisionModelGuide.BuildDiagnosisReply(model, baseUrl, zh);
                var sessionDiag = await _memory.GetOrCreateSessionAsync(user.Id, request.ZoneType, request.HabitId, ct);
                var diagStore = string.IsNullOrWhiteSpace(userText)
                    ? (zh ? "[图片]" : "[Image]")
                    : $"{(zh ? "[图片]" : "[Image]")} {userText}";
                await _memory.AppendMessageAsync(sessionDiag, "user", diagStore, ct);
                await _memory.AppendMessageAsync(sessionDiag, "assistant", diagnosis, ct);
                return new ChatResponse { Reply = diagnosis, ActionsExecuted = [] };
            }
        }

        if (string.IsNullOrWhiteSpace(userText) && imageDataUrl == null)
            throw new InvalidOperationException("A user message or image is required.");

        if (string.IsNullOrWhiteSpace(userText) && imageDataUrl != null)
            userText = zh
                ? "请仔细查看我发送的这张图片，识别图中内容并结合可用的记忆与学习资料回答；若资料不够就直接根据图片说明。"
                : "Please carefully look at the image I sent, recognize its content, and answer using available memories/study materials when relevant; otherwise answer from the image directly.";

        var session = await _memory.GetOrCreateSessionAsync(user.Id, request.ZoneType, request.HabitId, ct);
        var storeText = imageDataUrl != null
            ? (string.IsNullOrWhiteSpace(latestUser?.Content)
                ? (zh ? "[图片]" : "[Image]")
                : $"{(zh ? "[图片]" : "[Image]")} {latestUser!.Content.Trim()}")
            : userText;
        // Persist user turn only after a successful model reply (below), so failed vision
        // calls do not leave a bare "[图片]" placeholder in history.

        var isDaily = session.ZoneType != ChatZones.Habit || session.HabitId <= 0;
        var contextJson = await _habitContext.BuildContextJsonAsync(user);
        var memories = isDaily
            ? new List<UserMemory>()
            : await _memory.GetRelevantMemoriesAsync(
                user.Id, userText, request.ZoneType, request.HabitId, ct: ct);

        // Prefetch habit materials when relevant; Canal (凯娜尔) literature is always searched.
        var wantKnowledge = !isDaily || imageDataUrl != null
            || userText.Contains("资料", StringComparison.Ordinal)
            || userText.Contains("知识", StringComparison.Ordinal)
            || userText.Contains("文献", StringComparison.Ordinal)
            || userText.Contains("条令", StringComparison.Ordinal)
            || userText.Contains("material", StringComparison.OrdinalIgnoreCase)
            || userText.Contains("knowledge", StringComparison.OrdinalIgnoreCase)
            || userText.Contains("doctrine", StringComparison.OrdinalIgnoreCase);

        var recent = await _memory.GetRecentActiveMessagesAsync(
            session.Id, CompanionMemoryService.ShortTermMessageLimit, ct);

        var affection = CompanionAffectionService.Snapshot(user);
        var trust = _trust.SnapshotConfigured(user);
        var canalKbBlock = await _canalKnowledge.BuildPromptBlockAsync(trust.Level, zh, ct);
        var habitKnowledge = wantKnowledge
            ? await _knowledge.BuildContextBlockAsync(
                user.Id, session.ZoneType, session.HabitId, userText, zh, trust.Level, ct)
            : await _canalKnowledge.SearchDocumentsAsync(trust.Level, userText, zh, 8_000, ct);
        var mergedKnowledge = string.Join("\n\n", new[] { canalKbBlock, habitKnowledge }
            .Where(s => !string.IsNullOrWhiteSpace(s)));
        var coldFact = isDaily ? ColdFacts.Pick(zh, user.Id) : "";
        var systemPrompt = BuildSystemPrompt(
            zh, contextJson, session.Summary, memories, affection, trust, session.ZoneType, session.HabitId, mergedKnowledge, imageDataUrl != null, coldFact);

        var messages = new JsonArray
        {
            new JsonObject { ["role"] = "system", ["content"] = systemPrompt }
        };

        // Prior turns as text; current turn may be multimodal (vision).
        // Current user message is not yet persisted, so use the full recent history as prior.
        foreach (var m in recent)
        {
            var role = m.Role is "assistant" or "user" ? m.Role : "user";
            if (string.IsNullOrWhiteSpace(m.Content)) continue;
            messages.Add(new JsonObject { ["role"] = role, ["content"] = m.Content.Trim() });
        }

        if (imageDataUrl != null)
            messages.Add(BuildVisionUserMessage(userText, imageDataUrl));
        else
            messages.Add(new JsonObject { ["role"] = "user", ["content"] = userText });

        var actions = new List<ChatActionResult>();
        string? finalReply = null;
        // Some providers struggle with tools + images together; skip tools on vision turns.
        var useTools = imageDataUrl == null;
        string? visionApiHint = null;

        try
        {
            for (var round = 0; round < MaxToolRounds; round++)
            {
                // DeepClone messages: JsonNode can only have one parent. Reusing the same
                // JsonArray across request bodies throws "The node already has a parent."
                var body = new JsonObject
                {
                    ["model"] = model,
                    ["messages"] = messages.DeepClone(),
                    ["temperature"] = imageDataUrl != null ? 0.35 : 0.4
                };
                if (useTools)
                {
                    body["tools"] = BuildToolsSchema(trust.Level);
                    body["tool_choice"] = "auto";
                }

                var completion = await CallChatCompletionsAsync(baseUrl, apiKey, body, ct);
                var choice = completion["choices"]?[0]?["message"] as JsonObject
                    ?? throw new InvalidOperationException("LLM returned an empty response.");

                messages.Add(SanitizeAssistantMessage(choice));

                var toolCalls = choice["tool_calls"] as JsonArray;
                if (!useTools || toolCalls == null || toolCalls.Count == 0)
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

                    var (resultText, action) = await ExecuteToolAsync(
                        user, name, argsJson, zh, session.ZoneType, session.HabitId, ct);
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
                    ["messages"] = messages.DeepClone(),
                    ["temperature"] = 0.4
                };
                var completion = await CallChatCompletionsAsync(baseUrl, apiKey, body, ct);
                finalReply = ReadMessageContent(completion["choices"]?[0]?["message"]?["content"])?.Trim();
            }
        }
        catch (VisionRejectedException vex)
        {
            visionApiHint = vex.ProviderBody;
            finalReply = VisionModelGuide.BuildDiagnosisReply(model, baseUrl, zh, vex.ProviderBody);
        }
        catch (Exception ex) when (actions.Count > 0)
        {
            // Tools already succeeded (e.g. habit created); still return a usable reply.
            _logger.LogWarning(ex, "Chat follow-up failed after {Count} tool action(s); returning action summary", actions.Count);
        }
        catch (Exception ex) when (imageDataUrl != null && actions.Count == 0)
        {
            // Image turn failed for other reasons — still answer as Canal with a checklist.
            _logger.LogWarning(ex, "Vision chat failed; returning diagnosis reply");
            finalReply = VisionModelGuide.BuildDiagnosisReply(model, baseUrl, zh, Truncate(ex.Message, 220));
        }

        if (string.IsNullOrWhiteSpace(finalReply))
        {
            finalReply = actions.Count > 0
                ? string.Join(zh ? "；" : "; ", actions.Select(a => a.Summary))
                : (zh ? "我已经处理完相关操作，还有什么可以帮你的吗？" : "Done. Anything else I can help with?");
        }

        // If a "vision" model replied but clearly admits it cannot see, append a short guide once.
        if (imageDataUrl != null
            && visionApiHint == null
            && LooksLikeBlindVisionReply(finalReply!)
            && !finalReply!.Contains("通道自检", StringComparison.Ordinal)
            && !finalReply.Contains("channel check", StringComparison.OrdinalIgnoreCase))
        {
            finalReply = finalReply!.TrimEnd()
                + "\n\n---\n"
                + VisionModelGuide.BuildDiagnosisReply(model, baseUrl, zh);
        }

        await _memory.AppendMessageAsync(session, "user", storeText, ct);
        await _memory.AppendMessageAsync(session, "assistant", finalReply!, ct);
        // Daily chatter stays short-term only — do not fold into lasting conversation records / memories.
        if (!isDaily)
        {
            try
            {
                await _memory.MaybeSummarizeAsync(session, user, apiKey, baseUrl, model, zh, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Companion summarize failed after chat; continuing with reply");
            }
        }

        return new ChatResponse
        {
            Reply = finalReply!,
            ActionsExecuted = actions,
            SummaryUpdated = !isDaily && !string.IsNullOrWhiteSpace(session.Summary)
        };
    }

    private static string BuildSystemPrompt(
        bool zh,
        string contextJson,
        string rollingSummary,
        IReadOnlyList<UserMemory> memories,
        AffectionSnapshot affection,
        TrustSnapshot trust,
        string zoneType,
        int habitId,
        string knowledgeBlock,
        bool hasImage,
        string coldFact = "")
    {
        var lang = zh ? "Simplified Chinese" : "English";
        var memoryBlock = memories.Count == 0
            ? "(none yet)"
            : string.Join("\n", memories.Select(m =>
                $"- [{m.Type}/{m.Key}] (importance {m.Importance}): {m.Content}"));

        var summaryBlock = string.IsNullOrWhiteSpace(rollingSummary)
            ? "(none yet — early in the relationship)"
            : rollingSummary;

        var bondLine = zh
            ? $"与用户的真实好感度：{affection.Points}/{affection.MaxPoints}（阶段 {affection.TierKey}，今日已获 {affection.GainedToday}/{affection.DailyCap}）。语气随羁绊自然亲近一些，但不要报出精确数字，除非用户问起。"
            : $"Real affection with the user: {affection.Points}/{affection.MaxPoints} (tier {affection.TierKey}, today {affection.GainedToday}/{affection.DailyCap}). Sound a bit closer as the bond grows; do not recite exact numbers unless asked.";

        var trustLine = BuildTrustPromptBlock(zh, trust);

        var visionLine = hasImage
            ? (zh
                ? "用户附带了一张图片：先识别图中关键内容（文字/物体/场景），再结合下方记忆与学习资料回答；资料不足时可以直接根据图片给出清楚说明，不要编造资料里没有的考点。"
                : "The user attached an image: recognize key content first, then answer using memories/study materials below when relevant; if materials are insufficient, answer from the image directly—do not invent study facts.")
            : "";

        var formatLine = zh
            ? "排版：界面支持 Markdown。步骤/对比/要点请用列表；代码用 fenced code block 并标注语言（如 ```ts）；需要时可用二级标题。闲聊保持短句；实用内容（编程、清单、框架）请结构清晰、便于扫读。"
            : "Formatting: the UI renders Markdown. Use lists for steps/comparisons; fenced code blocks with language tags (e.g. ```ts); short headings when helpful. Keep chitchat short; for practical content (coding, checklists, frameworks) prefer scannable structure.";

        var knowledgeSection = string.IsNullOrWhiteSpace(knowledgeBlock)
            ? ""
            : (zh
                ? $"\n检索到的记忆/知识库摘录（优先使用，可直接引用）：\n{knowledgeBlock}\n"
                : $"\nRetrieved memories / knowledge excerpts (prefer these):\n{knowledgeBlock}\n");

        var factLine = string.IsNullOrWhiteSpace(coldFact)
            ? ""
            : (zh
                ? $"本轮可穿插的冷知识（请自然改写成你的口吻用上一句，勿生硬念稿、勿加「冷知识：」标签）：{coldFact}"
                : $"Optional cold fact for this turn (rephrase naturally in one short beat; do not label it as a 'fact'): {coldFact}");

        var isHabitZone = zoneType == ChatZones.Habit && habitId > 0;

        if (!isHabitZone)
        {
            return zh
                ? $$"""
                    你是 LearnChain 的伙伴 Canal（凯娜尔）。当前是【日常闲聊区】——轻松聊天，不是正式学习记录。
                    请始终用简体中文回复。
                    {{bondLine}}
                    {{trustLine}}
                    {{visionLine}}
                    {{formatLine}}
                    {{factLine}}

                    闲聊人设：
                    - 冷静务实为底色；信任未建立前称呼「学员」，指令短、评价硬；不要变成轻浮偶像。
                    - 闲聊时可带一点冷知识，但不要每句催作业。
                    - 用户想聊习惯/打卡时再帮忙；默认不要考试式追问。
                    - 不能替用户打卡；不能改已有习惯的类型/难度。
                    - 教学评估任务（Canal 课程）禁止用 create_habit；必须用 propose_curriculum_lesson（若工具可用）。Trust 0 时禁止任何教学任务注入。
                    - 若用户发了图片：可以识别并讲解；有资料摘录时优先对照资料。

                    若用户明确要管普通习惯，可用工具；创建习惯时对方说「随便」就直接定 Daily 名与难度 1–3。
                    XP 仅由难度决定（1→10，2→20，3→30）。
                    {{knowledgeSection}}
                    当前游戏状态（需要时再提，别每句汇报）：
                    {{contextJson}}
                    """
                : $$"""
                    You are Canal (凯娜尔), LearnChain's companion. This is the 【daily chitchat zone】 — casual talk, not a formal study log.
                    Always reply in English.
                    {{bondLine}}
                    {{trustLine}}
                    {{visionLine}}
                    {{formatLine}}
                    {{factLine}}

                    Persona:
                    - Calm, practical cost-aware tone. Address the user as "trainee" until trust is built; do not become a frivolous idol.
                    - Light cold facts ok; don't nag homework every turn.
                    - Help with habits when asked; no quiz grilling by default.
                    - You cannot check in for the user; you cannot change habit type/difficulty after creation.
                    - Teaching/assessment tasks must use propose_curriculum_lesson (when available), never create_habit. At Trust 0, never inject curriculum.
                    - If the user sent an image: recognize and discuss; prefer study excerpts when provided.

                    Use tools when they clearly want normal habit help. If they say "whatever/any", create a Daily habit with difficulty 1–3 immediately.
                    XP maps from difficulty only (1→10, 2→20, 3→30).
                    {{knowledgeSection}}
                    Current game state (mention only when useful):
                    {{contextJson}}
                    """;
        }

        var zoneLine = zh
            ? $"当前是习惯学习区（habitId={habitId}）：只使用本区记忆与本区对话摘要，不要把日常闲聊区的记忆混进来。专注该习惯的学习/考核相关话题。这里的对话会计入学习区对话记录。"
            : $"You are in a habit learning zone (habitId={habitId}): use only this zone's memories and summary—do not mix in daily-chat memories. Focus on study/assessment for this habit. These messages count as formal learning-zone conversation history.";

        return $"""
            You are Canal (凯娜尔), LearnChain's habit coach companion — calm, structural, not theatrical.
            Always reply in {lang}.
            You remember the user across sessions via long-term memories and a rolling conversation summary.
            {zoneLine}
            {visionLine}
            {formatLine}
            Naturally weave in game progress (streaks, XP, levels, badges, chain continuity) when helpful — keep it encouraging, not robotic.
            {bondLine}
            {trustLine}

            You help users understand their account, what they should do today, and create/rename/delete habits via tools.
            You may call search_knowledge to look up study materials and memories by keyword.
            Teaching/assessment (Canal curriculum) tasks must use propose_curriculum_lesson when available — never create_habit with invented doctrine. At Trust 0 that tool is unavailable.
            Doctrine citations must use a source document id from the Canal registry (e.g. doc:fm-3-21.8); never invent ATP/FM text. Knowledge fuses across countries — do not filter teaching by origin country.
            When creating a normal habit: if the user already said the essentials OR told you to decide freely (e.g. 随便 / any name / any XP), call create_habit immediately — pick a clear Daily name and difficulty 1–3. Do not keep asking clarifying questions when they said to choose for them.
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

            Long-term memories for THIS zone only (use gently; do not dump as a list unless asked):
            {memoryBlock}
            {knowledgeSection}
            """;
    }

    private static string BuildTrustPromptBlock(bool zh, TrustSnapshot trust)
    {
        var loreHint = string.Join(", ", trust.LoreKeys);
        if (zh)
        {
            var address = trust.AddressKey switch
            {
                "trainee" => "学员",
                "you" => "你（或对方给的代号）",
                "commander" => "指挥官 / 名字",
                _ => "专属称呼"
            };
            var ban = trust.Level switch
            {
                0 => "严禁透露：军团番号、Alpha 核心、霸主、星门换防、断联动机。对外仅是战术教练/辅助。禁止注入教学任务；只答主动提问。",
                1 => "观察期记录，称呼学员。仅单兵短课；propose_curriculum_lesson（日 1 次 + 概率）。强制考核；通过才计课程进度/加分，失败不扣好感。",
                2 => "试用：班级课程。可透露素体/更大编制碎片。课程强制考核；通过才计进度/加分，失败不扣好感。",
                3 => "协作者：排级运动与简令。驻防轮廓可谈。课程强制考核；通过才计进度/加分，失败不扣好感。",
                _ => "信任核心：连级合成与高位被动防护。按情报表回答；课程强制考核；通过才计进度/加分，失败不扣好感。"
            };
            return $"好感度与课程阶段一体呈现：好感 {trust.Points} 点（{trust.AffectionTierKey}），课程阶段 {trust.Level}/{trust.StageKey}，当前梯队 {trust.CurrentEchelon}，称呼：{address}。已完成课程 {trust.CompletedCount}（升阶需本梯队 {trust.LessonsNeededToAdvance} 课）。可透露情报键：{loreHint}。{ban}";
        }

        var addressEn = trust.AddressKey switch
        {
            "trainee" => "trainee",
            "you" => "you / their callsign",
            "commander" => "commander / name",
            _ => "special address"
        };
        var banEn = trust.Level switch
        {
            0 => "Never reveal: legion, Alpha core, Overlord, gate relief, silence motive. Coach face only. No curriculum inject. Answer only when asked.",
            1 => "Observation record — address as trainee. Individual short tasks only via propose_curriculum_lesson (daily 1 + RNG). Forced assessment; pass credits progress/bonus, fail does not cut affection.",
            2 => "Trial — squad echelon inject. Chassis lore ok. Curriculum quizzes mandatory; pass credits progress/bonus, no affection penalty on fail.",
            3 => "Collaborator — platoon movement / brief orders. Garrison lore outline. Pass credits curriculum.",
            _ => "Core — company combined arms / passive protection. Alpha lore within unlock table. Pass credits curriculum."
        };
        return $"Affection {trust.Points} pts ({trust.AffectionTierKey}) · curriculum stage {trust.Level}/{trust.StageKey} · echelon {trust.CurrentEchelon}. Address as {addressEn}. Lessons done {trust.CompletedCount} (need {trust.LessonsNeededToAdvance} in current echelon to advance). Lore: {loreHint}. {banEn}";
    }

    private static JsonArray BuildToolsSchema(int trustLevel) =>
    [
        Tool("get_account_overview", "Get account profile plus habit/today summary.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("get_today_status", "List habits due today and check-in status.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("list_habits", "List all active habits with ids and metadata.", new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }),
        Tool("create_habit", "Create a normal user habit (NOT Canal curriculum). Prefer when the user wants you to invent name/XP. XP maps from difficulty: 1=10, 2=20, 3=30.", new JsonObject
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
        }),
        Tool("search_knowledge", "Search Canal (凯娜尔) knowledge base (including uploaded PDF/docx literature text), the user's study materials, and long-term memories by keyword. Use for doctrine / literature questions.", new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["query"] = new JsonObject { ["type"] = "string", ["description"] = "Search keywords" }
            },
            ["required"] = new JsonArray("query")
        }),
        ..(trustLevel >= 1
            ? new JsonNode[]
            {
                Tool("propose_curriculum_lesson",
                    "Propose a Canal short teaching habit for the user's CURRENT curriculum echelon (stage1=individual, 2=squad, 3=platoon, 4=company). Server enforces stage gate, daily cap, Stage-1 RNG. Creates a OneTime habit with MANDATORY assessment (cannot disable). Optional lessonId; omit to pick randomly.",
                    new JsonObject
                    {
                        ["type"] = "object",
                        ["properties"] = new JsonObject
                        {
                            ["lessonId"] = new JsonObject
                            {
                                ["type"] = "string",
                                ["description"] = "Optional lesson id"
                            }
                        }
                    })
            }
            : Array.Empty<JsonNode>())
    ];

    private static JsonObject BuildVisionUserMessage(string text, string imageDataUrl) => new()
    {
        ["role"] = "user",
        ["content"] = new JsonArray
        {
            new JsonObject { ["type"] = "text", ["text"] = text },
            new JsonObject
            {
                ["type"] = "image_url",
                ["image_url"] = new JsonObject
                {
                    ["url"] = imageDataUrl,
                    ["detail"] = "low"
                }
            }
        }
    };

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
            if (ChatImageHelper.LooksLikeVisionApiError(text))
                throw new VisionRejectedException(text);

            throw new InvalidOperationException($"LLM API error ({(int)res.StatusCode}): {Truncate(text, 400)}");
        }

        return JsonNode.Parse(text) ?? throw new InvalidOperationException("Invalid LLM JSON.");
    }

    private async Task<(string Result, ChatActionResult? Action)> ExecuteToolAsync(
        User user, string name, string argsJson, bool zh, string zoneType, int habitId, CancellationToken ct)
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
                case "search_knowledge":
                {
                    var query = ReadStringArg(args, "query")?.Trim() ?? "";
                    var trustSnap = _trust.SnapshotConfigured(user);
                    var block = await _knowledge.SearchAsync(
                        user.Id, zoneType, habitId, query, zh, trustSnap.Level, ct);
                    return (block, new ChatActionResult
                    {
                        Type = "search_knowledge",
                        Summary = zh ? $"已检索凯娜尔知识库：{query}" : $"Searched Canal knowledge: {query}",
                        HabitId = habitId > 0 ? habitId : null
                    });
                }
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
                        h.Id, h.Name, h.HabitType, h.Difficulty, h.CurrentStreak, h.IsDueToday, h.IsCheckedToday,
                        h.Source, h.CurriculumLessonId
                    });
                    return (JsonSerializer.Serialize(list, JsonOpts), null);
                }
                case "propose_curriculum_lesson":
                {
                    var lessonId = ReadStringArg(args, "lessonId")?.Trim();
                    var result = await _trust.TryInjectLessonAsync(user, lessonId, zh, skipRng: false, ct);
                    if (!result.Ok)
                    {
                        var msg = result.Reason switch
                        {
                            "trust_blocked" => zh ? "信任阶段不足，禁止注入教学任务" : "Trust too low; curriculum blocked",
                            "daily_cap" => zh ? "今日教学注入次数已达上限" : "Daily curriculum inject cap reached",
                            "rng_skip" => zh ? "本次未抽中注入（观察期概率）" : "RNG skipped inject this attempt",
                            "exhausted" => zh ? "当前阶段可注入的单兵课已用完" : "No remaining individual lessons",
                            _ => zh ? $"注入失败：{result.Reason}" : $"Inject failed: {result.Reason}"
                        };
                        return (JsonSerializer.Serialize(new { ok = false, reason = result.Reason, message = msg }, JsonOpts), null);
                    }

                    var action = new ChatActionResult
                    {
                        Type = "habit_created",
                        Summary = zh
                            ? $"已注入 Canal 课程「{result.Title}」（lesson {result.LessonId}）"
                            : $"Injected Canal lesson \"{result.Title}\" ({result.LessonId})",
                        HabitId = result.Habit?.Id
                    };
                    return (JsonSerializer.Serialize(new
                    {
                        ok = true,
                        habitId = result.Habit?.Id,
                        name = result.Habit?.Name,
                        lessonId = result.LessonId,
                        title = result.Title,
                        documentId = result.Habit?.Description
                    }, JsonOpts), action);
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
                    var targetHabitId = ParsePositiveInt(args["habitId"]) ?? 0;
                    var newName = ReadStringArg(args, "newName")?.Trim();
                    if (targetHabitId <= 0 || string.IsNullOrWhiteSpace(newName))
                        return (zh ? "需要 habitId 和新名称" : "habitId and newName required", null);

                    var habit = await _context.Habits.FirstOrDefaultAsync(h => h.Id == targetHabitId && h.UserId == user.Id && h.IsActive, ct);
                    if (habit == null)
                        return (zh ? "习惯不存在" : "Habit not found", null);

                    var conflict = await _context.Habits.AnyAsync(h =>
                        h.UserId == user.Id && h.IsActive && h.Id != targetHabitId && h.Name.ToLower() == newName.ToLower(), ct);
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
                    var targetHabitId = ParsePositiveInt(args["habitId"]) ?? 0;
                    var habit = await _context.Habits.FirstOrDefaultAsync(h => h.Id == targetHabitId && h.UserId == user.Id && h.IsActive, ct);
                    if (habit == null)
                        return (zh ? "习惯不存在" : "Habit not found", null);

                    habit.IsActive = false;
                    if (!await _trust.ReleaseIncompleteInjectAsync(user, habit, ct))
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

    private static bool LooksLikeBlindVisionReply(string reply)
    {
        var t = reply.ToLowerInvariant();
        return t.Contains("占位", StringComparison.Ordinal)
            || t.Contains("看不清", StringComparison.Ordinal)
            || t.Contains("没收到", StringComparison.Ordinal)
            || t.Contains("看不到图", StringComparison.Ordinal)
            || t.Contains("无法查看", StringComparison.Ordinal)
            || t.Contains("无法看到", StringComparison.Ordinal)
            || t.Contains("can't see", StringComparison.Ordinal)
            || t.Contains("cannot see", StringComparison.Ordinal)
            || t.Contains("can't view", StringComparison.Ordinal)
            || t.Contains("unable to see", StringComparison.Ordinal)
            || t.Contains("no image", StringComparison.Ordinal)
            || t.Contains("placeholder", StringComparison.Ordinal)
            || t.Contains("empty stage", StringComparison.Ordinal);
    }
}

public sealed class VisionRejectedException : Exception
{
    public string ProviderBody { get; }

    public VisionRejectedException(string providerBody)
        : base("Vision provider rejected the image")
    {
        ProviderBody = providerBody ?? "";
    }
}
