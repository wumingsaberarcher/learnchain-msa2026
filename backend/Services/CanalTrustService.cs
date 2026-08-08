using System.Text.Json;
using System.Text.Json.Serialization;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace backend.Services;

/// <summary>
/// Curriculum stage + affection points (one Canal bond).
/// Level = curriculum TrustLevel (0–4) from lesson completion.
/// Points = CompanionAffection (check-in / chat / curriculum bonus).
/// </summary>
public record TrustSnapshot(
    int Level,
    int Points,
    string StageKey,
    string AddressKey,
    int InjectedCount,
    int CompletedCount,
    int LessonsToStage2,
    IReadOnlyList<string> LoreKeys,
    string AffectionTierKey,
    string Evaluation,
    string CurrentEchelon,
    int LessonsNeededToAdvance);

public record CurriculumInjectResult(
    bool Ok,
    string Reason,
    Habit? Habit = null,
    string? LessonId = null,
    string? Title = null);

public record CurriculumCompleteResult(
    bool Ok,
    int AwardedPoints,
    int TrustPoints,
    int TrustLevel,
    bool LeveledUp,
    string? LessonId = null);

/// <summary>Per-stage dispatch coverage used by the catch-up sweep.</summary>
public record CurriculumStageGap(
    int Stage,
    string Echelon,
    int Total,
    int Dispatched,
    int Missing);

public record CurriculumBackfillResult(
    bool Ran,
    string Reason,
    int Stage,
    int Created,
    IReadOnlyList<string> CreatedLessonIds,
    IReadOnlyList<CurriculumStageGap> Gaps);

public class CurriculumLesson
{
    public string LessonId { get; set; } = "";
    public string Echelon { get; set; } = "individual";
    public string Topic { get; set; } = "";
    public string TitleZh { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public List<string> CriteriaZh { get; set; } = new();
    public List<string> CriteriaEn { get; set; } = new();
    public string DocumentId { get; set; } = "";
    public int TrustPointsOnPass { get; set; } = 10;
    public int MinTrustToInject { get; set; } = 1;
}

public class CurriculumProgressState
{
    [JsonPropertyName("injected")]
    public List<string> Injected { get; set; } = new();

    [JsonPropertyName("completed")]
    public List<string> Completed { get; set; } = new();
}

public class CanalTrustService
{
    public const string CurriculumSource = "canal_curriculum";
    public const int MaxTrustLevel = 4;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly AppDbContext _db;
    private readonly CompanionAffectionService _affection;
    private readonly IConfiguration _config;
    private readonly ILogger<CanalTrustService> _logger;
    private readonly Lazy<IReadOnlyList<CurriculumLesson>> _lessons;

    public CanalTrustService(
        AppDbContext db,
        CompanionAffectionService affection,
        IConfiguration config,
        ILogger<CanalTrustService> logger)
    {
        _db = db;
        _affection = affection;
        _config = config;
        _logger = logger;
        _lessons = new Lazy<IReadOnlyList<CurriculumLesson>>(LoadLessons);
    }

    public double Stage1InjectChance =>
        Math.Clamp(_config.GetValue("CanalCurriculum:Stage1InjectChance", 0.22), 0.15, 0.30);

    /// <summary>Lessons of the current echelon required to advance to the next stage.</summary>
    public int LessonsToAdvance =>
        Math.Max(1, _config.GetValue("CanalCurriculum:LessonsToAdvance", 3));

    /// <summary>From this stage on, missing lessons of this stage and below are dispatched in one sweep.</summary>
    public int BackfillMinStage =>
        Math.Clamp(_config.GetValue("CanalCurriculum:BackfillMinStage", 2), 1, MaxTrustLevel);

    /// <summary>Safety valve so a corrupted state cannot flood the habit list.</summary>
    public int BackfillMaxPerRun =>
        Math.Clamp(_config.GetValue("CanalCurriculum:BackfillMaxPerRun", 32), 1, 100);

    public IReadOnlyList<CurriculumLesson> AllLessons => _lessons.Value;

    public static int CurriculumStage(User user) => Math.Clamp(user.TrustLevel, 0, MaxTrustLevel);

    public static string EchelonForStage(int stage) => stage switch
    {
        1 => "individual",
        2 => "squad",
        3 => "platoon",
        4 => "company",
        _ => "individual"
    };

    public TrustSnapshot SnapshotConfigured(User user)
    {
        var aff = CompanionAffectionService.Snapshot(user);
        var level = CurriculumStage(user);
        user.TrustPoints = aff.Points;
        var state = ParseState(user.CurriculumStateJson);
        return new TrustSnapshot(
            level,
            aff.Points,
            StageKey(level),
            AddressKey(level),
            state.Injected.Count,
            state.Completed.Count,
            LessonsToAdvance,
            LoreKeysUpTo(level),
            aff.TierKey,
            user.CanalEvaluation ?? "",
            level >= 1 ? EchelonForStage(level) : "none",
            LessonsToAdvance);
    }

    /// <summary>Legacy helper used by Admin when TrustLevel not yet synced.</summary>
    public static TrustSnapshot Snapshot(User user)
    {
        var aff = CompanionAffectionService.Snapshot(user);
        var level = CurriculumStage(user);
        var state = ParseState(user.CurriculumStateJson);
        return new TrustSnapshot(
            level,
            aff.Points,
            StageKey(level),
            AddressKey(level),
            state.Injected.Count,
            state.Completed.Count,
            3,
            LoreKeysUpTo(level),
            aff.TierKey,
            user.CanalEvaluation ?? "",
            level >= 1 ? EchelonForStage(level) : "none",
            3);
    }

    public static string StageKey(int level) => level switch
    {
        0 => "initial",
        1 => "observe",
        2 => "trial",
        3 => "collaborator",
        _ => "core"
    };

    public static string AddressKey(int level) => level switch
    {
        0 or 1 => "trainee",
        2 => "you",
        3 => "commander",
        _ => "callsign"
    };

    public static IReadOnlyList<string> LoreKeysUpTo(int level)
    {
        var all = new[] { "coach", "evaluator", "chassis", "garrison", "alpha" };
        var n = Math.Clamp(level + 1, 1, all.Length);
        return all.Take(n).ToList();
    }

    public IReadOnlyList<object> GetUnlockableLore(int level, bool zh)
    {
        var keys = LoreKeysUpTo(level);
        return keys.Select(k => (object)new
        {
            key = k,
            text = LoreText(k, zh)
        }).ToList();
    }

    public static string LoreText(string key, bool zh) => (key, zh) switch
    {
        ("coach", true) => "对外身份：战术教练 / 学习辅助。只给最低必要指导。",
        ("coach", false) => "Public role: tactics coach / study aide. Minimum necessary guidance only.",
        ("evaluator", true) => "你不是普通聊天模型：正处于观察期，在评估是否值得投入训练资源。",
        ("evaluator", false) => "Not a casual chatbot: observation period — assessing whether training investment is warranted.",
        ("chassis", true) => "当前形态是素体；曾服务于更大的军事编制（细节仍受限）。",
        ("chassis", false) => "Current form is a chassis body; formerly served a larger military formation (details still limited).",
        ("garrison", true) => "背景轮廓：驻防军团、阵地与消耗学说。完整番号与战史仍未开放。",
        ("garrison", false) => "Outline: garrison legion, positional/attrition doctrine. Full designation and war history still sealed.",
        ("alpha", true) => "完整身份：Alpha 全程序实例残核、第四驻防军团指挥链、星门与换防失败、与霸主长期断联动机——高价值亦高风险。",
        ("alpha", false) => "Full identity: Alpha-core remnant, 4th garrison command chain, gate collapse / relief failure, deliberate silence toward Overlord — high value, high risk.",
        _ => zh ? "（未收录）" : "(unknown)"
    };

    public bool CanInjectCurriculum(User user) => CurriculumStage(user) >= 1;

    /// <summary>
    /// Study text for quiz generation from lesson catalog (criteria), with habit.Description fallback.
    /// </summary>
    public string? BuildLessonStudyText(string? lessonId, bool zh, Habit? habit = null)
    {
        CurriculumLesson? lesson = null;
        if (!string.IsNullOrWhiteSpace(lessonId))
        {
            lesson = AllLessons.FirstOrDefault(l =>
                l.LessonId.Equals(lessonId.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (lesson != null)
        {
            var title = zh ? lesson.TitleZh : lesson.TitleEn;
            var criteria = zh ? lesson.CriteriaZh : lesson.CriteriaEn;
            if (criteria.Count == 0)
                criteria = zh ? lesson.CriteriaEn : lesson.CriteriaZh;

            var lines = new List<string>
            {
                zh ? $"【Canal 课纲】{title}" : $"[Canal syllabus] {title}",
                zh ? $"主题：{lesson.Topic}" : $"Topic: {lesson.Topic}",
                zh ? "考核要点：" : "Assessment criteria:",
            };
            for (var i = 0; i < criteria.Count; i++)
                lines.Add($"{i + 1}. {criteria[i]}");
            if (!string.IsNullOrWhiteSpace(lesson.DocumentId))
                lines.Add($"Source ref: {lesson.DocumentId}");
            lines.Add(zh
                ? "出题与阅卷请严格依据以上课纲：考查学员是否理解并落实这些标准，勿编造课纲外的专有战史细节。"
                : "Author and grade strictly from this syllabus: test understanding and application of these criteria; do not invent lore outside the syllabus.");
            return string.Join("\n", lines);
        }

        var desc = habit?.Description?.Trim();
        if (!string.IsNullOrWhiteSpace(desc))
        {
            var name = habit!.Name?.Trim() ?? "";
            return (zh ? $"【Canal 课纲】{name}\n{desc}" : $"[Canal syllabus] {name}\n{desc}");
        }

        return null;
    }

    /// <summary>
    /// Stage 0 blocked. Stage 1: individual + daily 1 + RNG 15–30%.
    /// Stage 2+: current echelon only, daily 1, no RNG. Forced assessment habits.
    /// </summary>
    public async Task<CurriculumInjectResult> TryInjectLessonAsync(
        User user,
        string? lessonId = null,
        bool zh = true,
        bool skipRng = false,
        CancellationToken ct = default)
    {
        var level = CurriculumStage(user);
        if (level < 1)
            return new CurriculumInjectResult(false, "trust_blocked");

        await PruneStaleInjectsAsync(user, ct);

        EnsureInjectDay(user);
        if (user.CurriculumInjectCountToday >= 1)
            return new CurriculumInjectResult(false, "daily_cap");

        user.CurriculumInjectCountToday += 1;

        if (level == 1 && !skipRng)
        {
            var roll = Random.Shared.NextDouble();
            if (roll > Stage1InjectChance)
            {
                await RefreshEvaluationAsync(user, zh, ct);
                await _db.SaveChangesAsync(ct);
                return new CurriculumInjectResult(false, "rng_skip");
            }
        }

        var echelon = EchelonForStage(level);
        var state = ParseState(user.CurriculumStateJson);
        var pool = AllLessons
            .Where(l => l.Echelon.Equals(echelon, StringComparison.OrdinalIgnoreCase)
                        && l.MinTrustToInject <= level
                        && !state.Injected.Contains(l.LessonId, StringComparer.OrdinalIgnoreCase))
            .ToList();

        CurriculumLesson? lesson = null;
        if (!string.IsNullOrWhiteSpace(lessonId))
            lesson = pool.FirstOrDefault(l => l.LessonId.Equals(lessonId, StringComparison.OrdinalIgnoreCase));
        if (lesson == null && pool.Count > 0)
            lesson = pool[Random.Shared.Next(pool.Count)];

        if (lesson == null)
        {
            await RefreshEvaluationAsync(user, zh, ct);
            await _db.SaveChangesAsync(ct);
            return new CurriculumInjectResult(false, "exhausted");
        }

        var title = zh ? lesson.TitleZh : lesson.TitleEn;
        var habit = await CreateLessonHabitAsync(user, lesson, zh, dueDays: 7, ct);

        if (!state.Injected.Contains(lesson.LessonId, StringComparer.OrdinalIgnoreCase))
            state.Injected.Add(lesson.LessonId);
        user.CurriculumStateJson = JsonSerializer.Serialize(state, JsonOpts);
        await RefreshEvaluationAsync(user, zh, ct);
        await _db.SaveChangesAsync(ct);

        return new CurriculumInjectResult(true, "ok", habit, lesson.LessonId, title);
    }

    /// <summary>Builds and tracks the assessment habit for a lesson. Caller owns SaveChanges.</summary>
    private async Task<Habit> CreateLessonHabitAsync(
        User user,
        CurriculumLesson lesson,
        bool zh,
        int dueDays,
        CancellationToken ct)
    {
        var title = zh ? lesson.TitleZh : lesson.TitleEn;
        var criteria = (zh ? lesson.CriteriaZh : lesson.CriteriaEn).Take(4).ToList();
        var desc = string.Join("\n", criteria.Select((c, i) => $"{i + 1}. {c}"))
                   + $"\n\n[{lesson.DocumentId}]";

        var habitName = zh ? $"【Canal 课程】{title}" : $"[Canal] {title}";
        var exists = await _db.Habits.AnyAsync(h =>
            h.UserId == user.Id && h.IsActive && h.Name.ToLower() == habitName.ToLower(), ct);
        if (exists)
            habitName = $"{habitName} {DateTime.UtcNow:HHmmssfff}";

        var habit = new Habit
        {
            UserId = user.Id,
            Name = habitName,
            Description = desc,
            HabitType = "OneTime",
            Frequency = HabitXpService.GetFrequencyLabel("OneTime"),
            Difficulty = 1,
            BaseXP = HabitXpService.GetBaseXP(1),
            DueDate = DateTime.UtcNow.Date.AddDays(dueDays),
            CompletionType = 1,
            IsActive = true,
            IsCompleted = false,
            CreatedAt = DateTime.UtcNow,
            Source = CurriculumSource,
            CurriculumLessonId = lesson.LessonId,
            AssessmentEnabled = true,
            AssessmentDifficulty = "medium",
        };

        _db.Habits.Add(habit);
        return habit;
    }

    /// <summary>
    /// Catch-up sweep for stage &gt;= BackfillMinStage (default 2): audits every stage up to the
    /// current one and dispatches all lessons that were never handed out. Admin trust jumps skip
    /// the chat-driven inject path entirely, so without this a T4 account can hold zero lessons.
    /// Ignores the daily inject cap and the stage-1 RNG.
    /// </summary>
    public async Task<CurriculumBackfillResult> BackfillCurriculumAsync(
        User user,
        bool zh = true,
        bool force = false,
        CancellationToken ct = default)
    {
        var stage = CurriculumStage(user);
        var empty = Array.Empty<string>();

        if (stage < 1)
            return new CurriculumBackfillResult(false, "trust_blocked", stage, 0, empty, []);
        if (!force && stage < BackfillMinStage)
            return new CurriculumBackfillResult(false, "stage_below_threshold", stage, 0, empty, []);

        await PruneStaleInjectsAsync(user, ct);
        var state = ParseState(user.CurriculumStateJson);

        // "Dispatched" = tracked in progress state OR a habit row exists (even completed/archived),
        // so a re-run never duplicates lessons the user already received.
        var habitLessonIds = await _db.Habits
            .AsNoTracking()
            .Where(h => h.UserId == user.Id
                        && h.Source == CurriculumSource
                        && h.CurriculumLessonId != null)
            .Select(h => h.CurriculumLessonId!)
            .ToListAsync(ct);

        var dispatched = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var id in habitLessonIds)
            if (!string.IsNullOrWhiteSpace(id)) dispatched.Add(id.Trim());
        foreach (var id in state.Injected) dispatched.Add(id);
        foreach (var id in state.Completed) dispatched.Add(id);

        var gaps = new List<CurriculumStageGap>();
        var missing = new List<CurriculumLesson>();
        for (var s = 1; s <= stage; s++)
        {
            var echelon = EchelonForStage(s);
            var lessons = AllLessons
                .Where(l => l.Echelon.Equals(echelon, StringComparison.OrdinalIgnoreCase)
                            && l.MinTrustToInject <= stage)
                .ToList();
            var gapLessons = lessons.Where(l => !dispatched.Contains(l.LessonId)).ToList();
            gaps.Add(new CurriculumStageGap(
                s, echelon, lessons.Count, lessons.Count - gapLessons.Count, gapLessons.Count));
            missing.AddRange(gapLessons);
        }

        if (missing.Count == 0)
            return new CurriculumBackfillResult(false, "nothing_missing", stage, 0, empty, gaps);

        var created = new List<string>();
        foreach (var lesson in missing.Take(BackfillMaxPerRun))
        {
            await CreateLessonHabitAsync(user, lesson, zh, dueDays: 21, ct);
            if (!state.Injected.Contains(lesson.LessonId, StringComparer.OrdinalIgnoreCase))
                state.Injected.Add(lesson.LessonId);
            created.Add(lesson.LessonId);
        }

        user.CurriculumStateJson = JsonSerializer.Serialize(state, JsonOpts);
        await RefreshEvaluationAsync(user, zh, ct);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "User {UserId} curriculum backfill at stage {Stage}: dispatched {Count} lesson(s) [{Lessons}]",
            user.Id, stage, created.Count, string.Join(", ", created));

        return new CurriculumBackfillResult(true, "backfilled", stage, created.Count, created, gaps);
    }

    /// <summary>Stage 0→1: first non-curriculum check-in enters observation.</summary>
    public async Task<bool> TryPromoteToObserveAsync(User user, Habit habit, CancellationToken ct = default)
    {
        if (CurriculumStage(user) > 0) return false;
        if (string.Equals(habit.Source, CurriculumSource, StringComparison.OrdinalIgnoreCase))
            return false;

        user.TrustLevel = 1;
        await RefreshEvaluationAsync(user, zh: true, ct);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("User {UserId} curriculum stage 0→1 (observe)", user.Id);
        return true;
    }

    public async Task<CurriculumCompleteResult> OnCurriculumHabitCompletedAsync(
        User user,
        Habit habit,
        CancellationToken ct = default)
    {
        var beforeLevel = CurriculumStage(user);

        if (!string.Equals(habit.Source, CurriculumSource, StringComparison.OrdinalIgnoreCase))
            return new CurriculumCompleteResult(false, 0, user.CompanionAffection, beforeLevel, false);

        var lessonId = habit.CurriculumLessonId?.Trim();
        if (string.IsNullOrWhiteSpace(lessonId))
            return new CurriculumCompleteResult(false, 0, user.CompanionAffection, beforeLevel, false);

        var state = ParseState(user.CurriculumStateJson);
        if (state.Completed.Contains(lessonId, StringComparer.OrdinalIgnoreCase))
            return new CurriculumCompleteResult(true, 0, user.CompanionAffection, beforeLevel, false, lessonId);

        var lesson = AllLessons.FirstOrDefault(l =>
            l.LessonId.Equals(lessonId, StringComparison.OrdinalIgnoreCase));
        var want = lesson?.TrustPointsOnPass ?? 10;

        state.Completed.Add(lessonId);
        if (!state.Injected.Contains(lessonId, StringComparer.OrdinalIgnoreCase))
            state.Injected.Add(lessonId);
        user.CurriculumStateJson = JsonSerializer.Serialize(state, JsonOpts);

        var award = await _affection.AwardBonusAsync(user, want, ct);

        var leveledUp = false;
        if (beforeLevel >= 1 && beforeLevel < MaxTrustLevel)
        {
            var echelon = EchelonForStage(beforeLevel);
            var doneInEchelon = state.Completed.Count(id =>
            {
                var les = AllLessons.FirstOrDefault(l =>
                    l.LessonId.Equals(id, StringComparison.OrdinalIgnoreCase));
                return les != null && les.Echelon.Equals(echelon, StringComparison.OrdinalIgnoreCase);
            });
            if (doneInEchelon >= LessonsToAdvance)
            {
                user.TrustLevel = beforeLevel + 1;
                leveledUp = true;
                _logger.LogInformation(
                    "User {UserId} curriculum stage {Before}→{After} after {Count} {Echelon} lessons",
                    user.Id, beforeLevel, user.TrustLevel, doneInEchelon, echelon);
            }
        }

        user.TrustPoints = user.CompanionAffection;
        await RefreshEvaluationAsync(user, zh: true, ct);
        await _db.SaveChangesAsync(ct);

        return new CurriculumCompleteResult(
            true, award.Awarded, user.CompanionAffection, CurriculumStage(user), leveledUp, lessonId);
    }

    /// <summary>
    /// Soft-delete / abandon: free the inject slot when the lesson was never credited,
    /// so the pool cannot soft-lock stage advancement.
    /// </summary>
    public async Task<bool> ReleaseIncompleteInjectAsync(
        User user,
        Habit habit,
        CancellationToken ct = default)
    {
        if (!string.Equals(habit.Source, CurriculumSource, StringComparison.OrdinalIgnoreCase))
            return false;

        var lessonId = habit.CurriculumLessonId?.Trim();
        if (string.IsNullOrWhiteSpace(lessonId))
            return false;

        var state = ParseState(user.CurriculumStateJson);
        if (state.Completed.Contains(lessonId, StringComparer.OrdinalIgnoreCase))
            return false;

        var removed = state.Injected.RemoveAll(id =>
            id.Equals(lessonId, StringComparison.OrdinalIgnoreCase));
        if (removed == 0)
            return false;

        user.CurriculumStateJson = JsonSerializer.Serialize(state, JsonOpts);
        await RefreshEvaluationAsync(user, zh: true, ct);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation(
            "User {UserId} released incomplete curriculum inject {LessonId}",
            user.Id, lessonId);
        return true;
    }

    /// <summary>
    /// Drop inject slots whose habit is gone, inactive, or past due without check-in.
    /// Completed lessons stay in Injected; in-progress checked-in habits waiting for a pass stay held.
    /// </summary>
    public async Task<int> PruneStaleInjectsAsync(User user, CancellationToken ct = default)
    {
        var state = ParseState(user.CurriculumStateJson);
        var pending = state.Injected
            .Where(id => !state.Completed.Contains(id, StringComparer.OrdinalIgnoreCase))
            .ToList();
        if (pending.Count == 0)
            return 0;

        var today = DateTime.UtcNow.Date;
        var rows = await _db.Habits
            .AsNoTracking()
            .Where(h => h.UserId == user.Id
                        && h.Source == CurriculumSource
                        && h.CurriculumLessonId != null)
            .Select(h => new { h.CurriculumLessonId, h.IsActive, h.IsCompleted, h.DueDate })
            .ToListAsync(ct);

        var stillHeld = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var h in rows)
        {
            var lid = h.CurriculumLessonId!.Trim();
            if (string.IsNullOrEmpty(lid)) continue;
            if (state.Completed.Contains(lid, StringComparer.OrdinalIgnoreCase))
            {
                stillHeld.Add(lid);
                continue;
            }

            var expired = h.DueDate.HasValue && h.DueDate.Value.Date < today && !h.IsCompleted;
            if (h.IsActive && !expired)
                stillHeld.Add(lid);
        }

        var kept = state.Injected
            .Where(id =>
                state.Completed.Contains(id, StringComparer.OrdinalIgnoreCase)
                || stillHeld.Contains(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var pruned = state.Injected.Count - kept.Count;
        if (pruned <= 0)
            return 0;

        state.Injected = kept;
        user.CurriculumStateJson = JsonSerializer.Serialize(state, JsonOpts);
        _logger.LogInformation(
            "User {UserId} pruned {Count} stale curriculum inject slot(s)",
            user.Id, pruned);
        return pruned;
    }

    public async Task RefreshEvaluationAsync(User user, bool zh = true, CancellationToken ct = default)
    {
        var habitCount = await _db.Habits.CountAsync(h => h.UserId == user.Id && h.IsActive, ct);
        var checkInCount = await _db.CheckIns.CountAsync(c => c.UserId == user.Id, ct);
        var state = ParseState(user.CurriculumStateJson);
        var aff = CompanionAffectionService.Snapshot(user);
        var level = CurriculumStage(user);
        user.TrustPoints = aff.Points;

        user.CanalEvaluation = BuildEvaluation(
            zh, user.Username, aff.Points, aff.TierKey, level,
            state.Completed.Count, habitCount, checkInCount, user.Level, user.TotalXP, user.IsBanned);
    }

    public static string BuildEvaluation(
        bool zh,
        string username,
        int affectionPoints,
        string tierKey,
        int stageLevel,
        int lessonsDone,
        int habitCount,
        int checkInCount,
        int accountLevel,
        int totalXp,
        bool banned)
    {
        if (banned)
            return zh
                ? $"【{username}】账号受限中。Canal 中止进一步投入评估。"
                : $"[{username}] Account restricted. Canal suspends further investment assessment.";

        if (zh)
        {
            var tone = stageLevel switch
            {
                0 => "初始接触，仅应答主动提问，不注入教学任务。",
                1 => "观察期记录中，以学员称呼评估是否值得投入训练。",
                2 => "试用协作：班级课题已开放，仍保持参谋克制。",
                3 => "协作者阶段：排级运动与简令练习可推进。",
                _ => "信任核心：可触及连级合成与高位被动防护议题。"
            };
            var drill = lessonsDone <= 0
                ? "课程记录为空。"
                : $"已完成 Canal 课程 {lessonsDone} 项。";
            var grind = checkInCount <= 0
                ? "尚无打卡履历。"
                : $"累计打卡 {checkInCount} 次，活跃习惯 {habitCount}，账号 Lv.{accountLevel}（{totalXp} XP）。";
            return $"好感 {affectionPoints}（{tierKey}）· 课程阶段 {stageLevel}。{tone}{drill}{grind}";
        }

        {
            var tone = stageLevel switch
            {
                0 => "Initial contact — answers only; no curriculum inject.",
                1 => "Observation record — addressed as trainee.",
                2 => "Trial collaborator — squad topics open.",
                3 => "Collaborator — platoon movement and brief orders.",
                _ => "Core trust — company combined arms / passive protection."
            };
            var drill = lessonsDone <= 0
                ? "No curriculum completions."
                : $"{lessonsDone} Canal lesson(s) completed.";
            var grind = checkInCount <= 0
                ? "No check-in history."
                : $"{checkInCount} check-ins, {habitCount} active habits, account Lv.{accountLevel} ({totalXp} XP).";
            return $"Affection {affectionPoints} ({tierKey}) · curriculum stage {stageLevel}. {tone} {drill} {grind}";
        }
    }

    private static void EnsureInjectDay(User user)
    {
        var today = DateTime.UtcNow.Date;
        if (user.CurriculumInjectDayUtc?.Date != today)
        {
            user.CurriculumInjectDayUtc = today;
            user.CurriculumInjectCountToday = 0;
        }
    }

    public static CurriculumProgressState ParseState(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new CurriculumProgressState();
        try
        {
            return JsonSerializer.Deserialize<CurriculumProgressState>(json, JsonOpts)
                   ?? new CurriculumProgressState();
        }
        catch
        {
            return new CurriculumProgressState();
        }
    }

    /// <summary>Kept for Admin list fallback naming.</summary>
    public static int LevelFromAffectionTier(int affectionTier) =>
        Math.Clamp(affectionTier, 0, MaxTrustLevel);

    private IReadOnlyList<CurriculumLesson> LoadLessons()
    {
        var dirs = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Data", "curriculum"),
            Path.Combine(Directory.GetCurrentDirectory(), "Data", "curriculum"),
        };
        var all = new List<CurriculumLesson>();
        foreach (var dir in dirs)
        {
            if (!Directory.Exists(dir)) continue;
            foreach (var path in Directory.GetFiles(dir, "*stage*.json"))
            {
                try
                {
                    var raw = File.ReadAllText(path);
                    var list = JsonSerializer.Deserialize<List<CurriculumLesson>>(raw, JsonOpts);
                    if (list is { Count: > 0 })
                    {
                        all.AddRange(list);
                        _logger.LogInformation("Loaded {Count} lessons from {Path}", list.Count, path);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load lessons from {Path}", path);
                }
            }
            if (all.Count > 0) break;
        }

        // Dedupe by lessonId
        var map = new Dictionary<string, CurriculumLesson>(StringComparer.OrdinalIgnoreCase);
        foreach (var l in all)
        {
            if (!string.IsNullOrWhiteSpace(l.LessonId))
                map[l.LessonId] = l;
        }
        if (map.Count == 0)
            _logger.LogWarning("Canal curriculum JSON missing — empty catalog");
        return map.Values.ToList();
    }
}
