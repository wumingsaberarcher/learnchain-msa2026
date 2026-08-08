using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public class CanalKnowledgeService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly AppDbContext _db;
    private readonly CurriculumSourceCatalog _sources;
    private readonly ILogger<CanalKnowledgeService> _logger;

    public CanalKnowledgeService(
        AppDbContext db,
        CurriculumSourceCatalog sources,
        ILogger<CanalKnowledgeService> logger)
    {
        _db = db;
        _sources = sources;
        _logger = logger;
    }

    public async Task EnsureSeededAsync(CancellationToken ct = default)
    {
        await MigrateLegacyCategoriesAsync(ct);
        await SeedIdentityFromJsonAsync(ct);
        await SyncSourceCatalogEntriesAsync(ct);
    }

    public async Task<List<CanalKnowledgeEntry>> ListAsync(
        string? category = null,
        bool includeInactive = true,
        CancellationToken ct = default)
    {
        var q = _db.CanalKnowledgeEntries.AsQueryable();
        if (!includeInactive)
            q = q.Where(e => e.IsActive);
        if (!string.IsNullOrWhiteSpace(category))
            q = q.Where(e => e.Category == category);
        return await q
            .OrderBy(e => e.SortOrder)
            .ThenBy(e => e.Id)
            .ToListAsync(ct);
    }

    public async Task<CanalKnowledgeEntry?> GetAsync(int id, CancellationToken ct = default) =>
        await _db.CanalKnowledgeEntries.FirstOrDefaultAsync(e => e.Id == id, ct);

    public async Task<CanalKnowledgeEntry> CreateAsync(AdminCanalKnowledgeDto dto, CancellationToken ct = default)
    {
        var key = string.IsNullOrWhiteSpace(dto.EntryKey)
            ? $"custom.{Guid.NewGuid():N}"
            : dto.EntryKey.Trim();

        if (await _db.CanalKnowledgeEntries.AnyAsync(e => e.EntryKey == key, ct))
            throw new InvalidOperationException("entry_key_exists");

        var entry = new CanalKnowledgeEntry
        {
            EntryKey = key,
            Category = NormalizeCategory(dto.Category),
            TitleZh = dto.TitleZh?.Trim() ?? "",
            TitleEn = dto.TitleEn?.Trim() ?? "",
            BodyZh = dto.BodyZh?.Trim() ?? "",
            BodyEn = dto.BodyEn?.Trim() ?? "",
            MinTrustLevel = Math.Clamp(dto.MinTrustLevel, 0, CanalTrustService.MaxTrustLevel),
            Section = dto.Section?.Trim() ?? "",
            IsBuiltin = false,
            IsActive = dto.IsActive,
            SortOrder = dto.SortOrder,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.CanalKnowledgeEntries.Add(entry);
        await _db.SaveChangesAsync(ct);
        return entry;
    }

    public async Task<CanalKnowledgeEntry?> UpdateAsync(int id, AdminCanalKnowledgeDto dto, CancellationToken ct = default)
    {
        var entry = await _db.CanalKnowledgeEntries.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (entry == null) return null;

        if (!string.IsNullOrWhiteSpace(dto.EntryKey) &&
            !dto.EntryKey.Trim().Equals(entry.EntryKey, StringComparison.OrdinalIgnoreCase))
        {
            var nextKey = dto.EntryKey.Trim();
            if (await _db.CanalKnowledgeEntries.AnyAsync(e => e.EntryKey == nextKey && e.Id != id, ct))
                throw new InvalidOperationException("entry_key_exists");
            if (!entry.IsBuiltin)
                entry.EntryKey = nextKey;
        }

        entry.Category = NormalizeCategory(dto.Category);
        entry.TitleZh = dto.TitleZh?.Trim() ?? "";
        entry.TitleEn = dto.TitleEn?.Trim() ?? "";
        entry.BodyZh = dto.BodyZh?.Trim() ?? "";
        entry.BodyEn = dto.BodyEn?.Trim() ?? "";
        entry.MinTrustLevel = Math.Clamp(dto.MinTrustLevel, 0, CanalTrustService.MaxTrustLevel);
        entry.Section = dto.Section?.Trim() ?? "";
        entry.IsActive = dto.IsActive;
        entry.SortOrder = dto.SortOrder;
        entry.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return entry;
    }

    /// <summary>Builtin entries are soft-deactivated; custom entries are removed.</summary>
    public async Task<bool> DeleteAsync(int id, CancellationToken ct = default)
    {
        var entry = await _db.CanalKnowledgeEntries.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (entry == null) return false;

        if (entry.IsBuiltin)
        {
            entry.IsActive = false;
            entry.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _db.CanalKnowledgeEntries.Remove(entry);
        }

        await _db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>Prompt block for Canal AI, filtered by curriculum trust stage.
    /// Identity entries are included in full; military/other include note + document excerpts.</summary>
    public async Task<string> BuildPromptBlockAsync(int trustLevel, bool zh, CancellationToken ct = default)
    {
        var level = Math.Clamp(trustLevel, 0, CanalTrustService.MaxTrustLevel);
        var rows = await _db.CanalKnowledgeEntries
            .AsNoTracking()
            .Where(e => e.IsActive && e.MinTrustLevel <= level)
            .OrderBy(e => e.Category == "identity" ? 0 : e.Category == "military" ? 1 : 2)
            .ThenBy(e => e.SortOrder)
            .ThenBy(e => e.Id)
            .ToListAsync(ct);

        if (rows.Count == 0) return "";

        const int maxTotal = 28_000;
        const int maxDocPerEntry = 6_000;
        var used = 0;

        var sb = new StringBuilder();
        sb.AppendLine(zh
            ? "【凯娜尔（Canal）知识库 — 按信任阶段开放；上传文献的正文已存档，可用 search_knowledge 检索】"
            : "[Canal (凯娜尔) knowledge — trust-gated; uploaded literature text is stored; use search_knowledge to retrieve]");

        void AppendGroup(string cat, string titleZh, string titleEn)
        {
            var group = rows.Where(e => e.Category == cat).ToList();
            if (group.Count == 0) return;
            sb.AppendLine();
            sb.AppendLine(zh ? $"## {titleZh}" : $"## {titleEn}");
            foreach (var e in group)
            {
                if (used >= maxTotal) break;
                var title = zh
                    ? (string.IsNullOrWhiteSpace(e.TitleZh) ? e.TitleEn : e.TitleZh)
                    : (string.IsNullOrWhiteSpace(e.TitleEn) ? e.TitleZh : e.TitleEn);
                var body = zh
                    ? (string.IsNullOrWhiteSpace(e.BodyZh) ? e.BodyEn : e.BodyZh)
                    : (string.IsNullOrWhiteSpace(e.BodyEn) ? e.BodyZh : e.BodyEn);

                sb.AppendLine($"- [{cat}|T≥{e.MinTrustLevel}] {title}");
                used += title.Length + 20;

                if (!string.IsNullOrWhiteSpace(body))
                {
                    var b = body.Length > 2500 ? body[..2500] + "…" : body;
                    sb.AppendLine($"  {b.Replace("\r\n", "\n").Replace("\n", "\n  ")}");
                    used += b.Length;
                }

                if (!string.IsNullOrWhiteSpace(e.ExtractedText))
                {
                    var room = Math.Min(maxDocPerEntry, maxTotal - used);
                    if (room < 200) continue;
                    var doc = e.ExtractedText.Length > room
                        ? e.ExtractedText[..room] + "…"
                        : e.ExtractedText;
                    var label = string.IsNullOrWhiteSpace(e.FileName) ? "document" : e.FileName;
                    sb.AppendLine(zh
                        ? $"  【文献正文摘录 · {label} · 共 {e.ExtractedText.Length} 字】"
                        : $"  [Literature excerpt · {label} · {e.ExtractedText.Length} chars]");
                    sb.AppendLine($"  {doc.Replace("\r\n", "\n").Replace("\n", "\n  ")}");
                    used += doc.Length + 40;
                }
            }
        }

        AppendGroup("identity", "角色身份", "Character identity");
        AppendGroup("military", "军事知识贮备", "Military knowledge");
        AppendGroup("other", "其他类型知识贮备", "Other knowledge");

        return sb.ToString().TrimEnd();
    }

    /// <summary>Keyword search over uploaded / stored Canal literature for tool use.</summary>
    public async Task<string> SearchDocumentsAsync(
        int trustLevel,
        string? query,
        bool zh,
        int maxChars = 12_000,
        CancellationToken ct = default)
    {
        var level = Math.Clamp(trustLevel, 0, CanalTrustService.MaxTrustLevel);
        var terms = ExtractTerms(query);
        var rows = await _db.CanalKnowledgeEntries
            .AsNoTracking()
            .Where(e => e.IsActive && e.MinTrustLevel <= level
                        && (e.ExtractedText != "" || e.BodyZh != "" || e.BodyEn != ""))
            .OrderBy(e => e.SortOrder)
            .ToListAsync(ct);

        var scored = rows.Select(e =>
            {
                var blob = $"{e.TitleZh} {e.TitleEn} {e.FileName} {e.BodyZh} {e.BodyEn} {e.ExtractedText}";
                var score = terms.Count == 0
                    ? (string.IsNullOrWhiteSpace(e.ExtractedText) ? 1 : 2)
                    : terms.Count(t => blob.Contains(t, StringComparison.OrdinalIgnoreCase));
                return (e, score);
            })
            .Where(x => terms.Count == 0 || x.score > 0)
            .OrderByDescending(x => x.score)
            .ThenByDescending(x => x.e.ExtractedText.Length)
            .Take(8)
            .ToList();

        if (scored.Count == 0)
            return zh ? "（凯娜尔知识库无匹配文献）" : "(No matching Canal knowledge documents.)";

        var sb = new StringBuilder();
        sb.AppendLine(zh ? "凯娜尔知识库检索结果：" : "Canal knowledge search hits:");
        var used = 0;
        foreach (var (e, score) in scored)
        {
            if (used >= maxChars) break;
            var title = zh
                ? (string.IsNullOrWhiteSpace(e.TitleZh) ? e.TitleEn : e.TitleZh)
                : (string.IsNullOrWhiteSpace(e.TitleEn) ? e.TitleZh : e.TitleEn);
            var text = !string.IsNullOrWhiteSpace(e.ExtractedText)
                ? e.ExtractedText
                : (zh ? e.BodyZh : e.BodyEn);
            var room = Math.Min(3500, maxChars - used);
            var chunk = text.Length > room ? text[..room] + "…" : text;
            sb.AppendLine($"[{e.Category}|score={score}] {title}" +
                          (string.IsNullOrWhiteSpace(e.FileName) ? "" : $" ({e.FileName})"));
            sb.AppendLine(chunk);
            sb.AppendLine("---");
            used += chunk.Length + 40;
        }

        return sb.ToString().TrimEnd();
    }

    public async Task<CanalKnowledgeEntry?> AttachDocumentAsync(
        int id,
        string fileName,
        string contentType,
        long size,
        string storedPath,
        string extractedText,
        CancellationToken ct = default)
    {
        var entry = await _db.CanalKnowledgeEntries.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (entry == null) return null;

        entry.FileName = fileName;
        entry.ContentType = contentType;
        entry.FileSize = size;
        entry.StoredPath = storedPath;
        entry.ExtractedText = extractedText ?? "";
        if (string.IsNullOrWhiteSpace(entry.BodyZh) && !string.IsNullOrWhiteSpace(extractedText))
            entry.BodyZh = $"已上传文献《{fileName}》，正文已抽取 {extractedText.Length} 字供凯娜尔引用。";
        if (string.IsNullOrWhiteSpace(entry.BodyEn) && !string.IsNullOrWhiteSpace(extractedText))
            entry.BodyEn = $"Uploaded literature \"{fileName}\"; {extractedText.Length} chars extracted for Canal recall.";
        entry.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return entry;
    }

    private async Task MigrateLegacyCategoriesAsync(CancellationToken ct)
    {
        var rows = await _db.CanalKnowledgeEntries
            .Where(e => e.Category != "identity" && e.Category != "military" && e.Category != "other")
            .ToListAsync(ct);
        if (rows.Count == 0) return;

        foreach (var e in rows)
            e.Category = NormalizeCategory(e.Category);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Migrated {Count} Canal knowledge categories to identity/military/other", rows.Count);
    }

    private static HashSet<string> ExtractTerms(string? text)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(text)) return set;
        foreach (System.Text.RegularExpressions.Match m in
                 System.Text.RegularExpressions.Regex.Matches(text.ToLowerInvariant(), @"[\p{L}\p{N}]{2,}"))
        {
            if (m.Value.Length >= 2) set.Add(m.Value);
            if (set.Count >= 24) break;
        }
        return set;
    }

    private async Task SeedIdentityFromJsonAsync(CancellationToken ct)
    {
        var paths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Data", "curriculum", "canal_knowledge_seed.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "Data", "curriculum", "canal_knowledge_seed.json"),
        };

        List<SeedRow>? seeds = null;
        foreach (var path in paths)
        {
            if (!File.Exists(path)) continue;
            try
            {
                seeds = JsonSerializer.Deserialize<List<SeedRow>>(await File.ReadAllTextAsync(path, ct), JsonOpts);
                if (seeds is { Count: > 0 })
                {
                    _logger.LogInformation("Loaded {Count} Canal knowledge seeds from {Path}", seeds.Count, path);
                    break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read Canal knowledge seed {Path}", path);
            }
        }

        if (seeds is not { Count: > 0 }) return;

        foreach (var s in seeds)
        {
            if (string.IsNullOrWhiteSpace(s.EntryKey)) continue;
            var existing = await _db.CanalKnowledgeEntries
                .FirstOrDefaultAsync(e => e.EntryKey == s.EntryKey, ct);
            if (existing != null)
            {
                // Keep admin edits; only ensure builtin flag + reactivate if still seeded shape
                existing.IsBuiltin = true;
                continue;
            }

            _db.CanalKnowledgeEntries.Add(new CanalKnowledgeEntry
            {
                EntryKey = s.EntryKey.Trim(),
                Category = NormalizeCategory(s.Category),
                TitleZh = s.TitleZh ?? "",
                TitleEn = s.TitleEn ?? "",
                BodyZh = s.BodyZh ?? "",
                BodyEn = s.BodyEn ?? "",
                MinTrustLevel = Math.Clamp(s.MinTrustLevel, 0, CanalTrustService.MaxTrustLevel),
                Section = s.Section ?? "",
                IsBuiltin = true,
                IsActive = true,
                SortOrder = s.SortOrder,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync(ct);
    }

    private async Task SyncSourceCatalogEntriesAsync(CancellationToken ct)
    {
        var sort = 1000;
        foreach (var portal in _sources.Portals)
        {
            var key = $"portal.{portal.Id}";
            await UpsertSourceRowAsync(
                key,
                "military",
                portal.Name,
                portal.Name,
                zhBody: $"检索入口：{portal.Name}\nURL：{portal.Url}\n访问：{portal.AccessNote}",
                enBody: $"Portal: {portal.Name}\nURL: {portal.Url}\nAccess: {portal.AccessNote}",
                minTrust: 1,
                section: "8",
                sortOrder: sort++,
                ct);
        }

        foreach (var doc in _sources.Documents)
        {
            var key = $"source.{doc.Id}";
            var year = doc.Year?.ToString() ?? "n/a";
            var echelons = string.Join(", ", doc.Echelons);
            var topics = string.Join(", ", doc.Topics);
            await UpsertSourceRowAsync(
                key,
                "military",
                doc.Title,
                doc.Title,
                zhBody:
                $"文献登记（来源向，不提炼知识点）。\n编号：doc:{doc.Id}\n年份：{year} · 来源国：{doc.OriginCountry} · 类型：{doc.DocType}\n梯队：{echelons}\n主题：{topics}\n定位：{doc.UrlOrLocator}\n访问：{doc.AccessNote}\n章节：{doc.Section}",
                enBody:
                $"Source registry entry (provenance only — no extracted knowledge points).\nId: doc:{doc.Id}\nYear: {year} · Origin: {doc.OriginCountry} · Type: {doc.DocType}\nEchelons: {echelons}\nTopics: {topics}\nLocator: {doc.UrlOrLocator}\nAccess: {doc.AccessNote}\nSection: {doc.Section}",
                minTrust: 1,
                section: string.IsNullOrWhiteSpace(doc.Section) ? "7" : doc.Section,
                sortOrder: sort++,
                ct);
        }

        await _db.SaveChangesAsync(ct);
    }

    private async Task UpsertSourceRowAsync(
        string key,
        string category,
        string titleZh,
        string titleEn,
        string zhBody,
        string enBody,
        int minTrust,
        string section,
        int sortOrder,
        CancellationToken ct)
    {
        var existing = await _db.CanalKnowledgeEntries.FirstOrDefaultAsync(e => e.EntryKey == key, ct);
        if (existing != null)
        {
            existing.IsBuiltin = true;
            // Refresh catalog text for military registry rows (do not wipe uploaded ExtractedText).
            if (existing.IsBuiltin && string.IsNullOrWhiteSpace(existing.ExtractedText)
                && (existing.Category is "military" or "source" or "portal"
                    || existing.EntryKey.StartsWith("source.", StringComparison.OrdinalIgnoreCase)
                    || existing.EntryKey.StartsWith("portal.", StringComparison.OrdinalIgnoreCase)))
            {
                existing.Category = "military";
                existing.TitleZh = titleZh;
                existing.TitleEn = titleEn;
                existing.BodyZh = zhBody;
                existing.BodyEn = enBody;
                existing.Section = section;
                existing.MinTrustLevel = minTrust;
                existing.SortOrder = sortOrder;
                existing.UpdatedAt = DateTime.UtcNow;
            }
            return;
        }

        _db.CanalKnowledgeEntries.Add(new CanalKnowledgeEntry
        {
            EntryKey = key,
            Category = NormalizeCategory(category),
            TitleZh = titleZh,
            TitleEn = titleEn,
            BodyZh = zhBody,
            BodyEn = enBody,
            MinTrustLevel = minTrust,
            Section = section,
            IsBuiltin = true,
            IsActive = true,
            SortOrder = sortOrder,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
    }

    /// <summary>Maps legacy + new labels onto identity | military | other.</summary>
    public static string NormalizeCategory(string? raw)
    {
        var v = (raw ?? "other").Trim().ToLowerInvariant();
        return v switch
        {
            "identity" or "lore" or "character" or "角色" or "角色身份" => "identity",
            "military" or "source" or "portal" or "doctrine" or "军事" or "军事知识" or "军事知识贮备" => "military",
            _ => "other",
        };
    }

    private sealed class SeedRow
    {
        public string EntryKey { get; set; } = "";
        public string Category { get; set; } = "identity";
        public string? TitleZh { get; set; }
        public string? TitleEn { get; set; }
        public string? BodyZh { get; set; }
        public string? BodyEn { get; set; }
        public int MinTrustLevel { get; set; }
        public string? Section { get; set; }
        public int SortOrder { get; set; }
    }
}
