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
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<CanalKnowledgeService> _logger;

    public CanalKnowledgeService(
        AppDbContext db,
        CurriculumSourceCatalog sources,
        IHttpClientFactory httpClientFactory,
        ILogger<CanalKnowledgeService> logger)
    {
        _db = db;
        _sources = sources;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task EnsureSeededAsync(CancellationToken ct = default)
    {
        await MigrateLegacyCategoriesAsync(ct);
        await SeedIdentityFromJsonAsync(ct);
        await SyncMilitaryCoreCatalogAsync(ct);
        await SyncCnSourcesCatalogAsync(ct);
        await SyncSourceCatalogEntriesAsync(ct);
    }

    public sealed record RemoteFetchResult(
        string DocId,
        bool Ok,
        string Reason,
        string? Url = null,
        int? Chars = null);

    public sealed record LocalImportResult(string DocId, bool Ok, string Reason, string? Key = null, int? Chars = null, string? FileName = null, long? Size = null);

    /// <summary>
    /// Import files from App_Data/canal-pdfs named {DOC_ID}.pdf|.txt into military.core.{DOC_ID}.
    /// Prefers .txt (OCR) when both exist.
    /// </summary>
    public async Task<IReadOnlyList<LocalImportResult>> ImportLocalDocsFolderAsync(CancellationToken ct = default)
    {
        var dirs = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "App_Data", "canal-pdfs"),
            Path.Combine(Directory.GetCurrentDirectory(), "App_Data", "canal-pdfs"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "App_Data", "canal-pdfs"),
        };

        string? dir = dirs.FirstOrDefault(Directory.Exists);
        if (dir == null)
        {
            _logger.LogInformation("No App_Data/canal-pdfs folder — skip local doctrine import");
            return Array.Empty<LocalImportResult>();
        }

        var results = new List<LocalImportResult>();
        var files = Directory.GetFiles(dir)
            .Where(f =>
            {
                var ext = Path.GetExtension(f).ToLowerInvariant();
                return ext is ".txt" or ".pdf" or ".md";
            })
            .GroupBy(f => Path.GetFileNameWithoutExtension(f), StringComparer.OrdinalIgnoreCase)
            .Select(g =>
                g.OrderBy(f => Path.GetExtension(f).Equals(".txt", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                    .First())
            .ToList();

        var extractor = new HabitMaterialTextExtractor();
        foreach (var path in files)
        {
            ct.ThrowIfCancellationRequested();
            var docId = Path.GetFileNameWithoutExtension(path);
            if (docId.EndsWith("b", StringComparison.OrdinalIgnoreCase) && docId.Contains("JP-301", StringComparison.OrdinalIgnoreCase))
                continue;

            var key = $"military.core.{docId}";
            var entry = await _db.CanalKnowledgeEntries.FirstOrDefaultAsync(e => e.EntryKey == key, ct);
            if (entry == null)
            {
                results.Add(new LocalImportResult(docId, false, "entry_missing", Key: key));
                continue;
            }

            // Skip if already has substantial extracted text
            if (!string.IsNullOrWhiteSpace(entry.ExtractedText) && entry.ExtractedText.Length > 2000)
            {
                results.Add(new LocalImportResult(docId, true, "already_imported", Chars: entry.ExtractedText.Length));
                continue;
            }

            var fi = new FileInfo(path);
            if (fi.Length < 64)
            {
                results.Add(new LocalImportResult(docId, false, "file_too_small"));
                continue;
            }
            if (fi.Length > HabitMaterialTextExtractor.MaxCanalImportBytes)
            {
                results.Add(new LocalImportResult(docId, false, "file_too_large", Size: fi.Length));
                continue;
            }

            // Reject HTML masquerading as PDF (armypubs stubs)
            if (Path.GetExtension(path).Equals(".pdf", StringComparison.OrdinalIgnoreCase))
            {
                await using var probe = File.OpenRead(path);
                var buf = new byte[5];
                _ = await probe.ReadAsync(buf.AsMemory(0, 5), ct);
                var head = System.Text.Encoding.ASCII.GetString(buf);
                if (!head.StartsWith("%PDF", StringComparison.Ordinal))
                {
                    results.Add(new LocalImportResult(docId, false, "not_binary_pdf_html"));
                    continue;
                }
            }

            string extracted;
            var fileName = Path.GetFileName(path);
            await using (var stream = File.OpenRead(path))
            {
                extracted = await extractor.ExtractAsync(fileName, stream, ct);
            }

            if (string.IsNullOrWhiteSpace(extracted) || extracted.Length < 80)
            {
                results.Add(new LocalImportResult(docId, false, "extract_empty", FileName: fileName));
                continue;
            }

            var destDir = Path.Combine(
                Path.GetDirectoryName(dir) ?? dir,
                "canal-knowledge",
                entry.Id.ToString());
            Directory.CreateDirectory(destDir);
            var destPath = Path.Combine(destDir, fileName);
            File.Copy(path, destPath, overwrite: true);

            await AttachDocumentAsync(
                entry.Id,
                fileName,
                extractor.DetectContentType(fileName),
                fi.Length,
                destPath,
                extracted,
                ct);

            results.Add(new LocalImportResult(docId, true, "imported", Chars: extracted.Length, FileName: fileName));
            _logger.LogInformation("Imported local doctrine {DocId} ({Chars} chars) into {Key}", docId, extracted.Length, key);
        }

        return results;
    }

    private async Task SyncCnSourcesCatalogAsync(CancellationToken ct)
    {
        var paths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Data", "curriculum", "cn_sources_catalog.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "Data", "curriculum", "cn_sources_catalog.json"),
        };

        MilitaryCoreFile? file = null;
        foreach (var path in paths)
        {
            if (!File.Exists(path)) continue;
            try
            {
                file = JsonSerializer.Deserialize<MilitaryCoreFile>(await File.ReadAllTextAsync(path, ct), JsonOpts);
                if (file?.Documents is { Count: > 0 })
                {
                    _logger.LogInformation("Loaded CN sources catalog ({Count}) from {Path}", file.Documents.Count, path);
                    break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load cn_sources_catalog from {Path}", path);
            }
        }

        if (file?.Documents is not { Count: > 0 }) return;

        var sort = 500;
        foreach (var portal in file.Portals ?? [])
        {
            if (string.IsNullOrWhiteSpace(portal.Id)) continue;
            await UpsertSourceRowAsync(
                $"portal.core.{portal.Id}",
                "military",
                portal.Name ?? portal.Id,
                portal.Name ?? portal.Id,
                zhBody: $"【CN 检索入口】{portal.Name}\nURL：{portal.Url}\n访问：{portal.AccessNote}",
                enBody: $"[CN portal] {portal.Name}\nURL: {portal.Url}\nAccess: {portal.AccessNote}",
                minTrust: 1,
                section: "CN-B",
                sortOrder: sort++,
                ct);
        }

        sort = 600;
        foreach (var doc in file.Documents)
        {
            if (string.IsNullOrWhiteSpace(doc.Id)) continue;
            var topics = string.Join(", ", doc.Topics ?? []);
            var echelons = string.Join(", ", doc.Echelons ?? []);
            var year = doc.Year?.ToString() ?? "n/a";
            var origin = string.IsNullOrWhiteSpace(doc.OriginCountry) ? "CN" : doc.OriginCountry!;
            var access = doc.AccessNote ?? "";
            var disclaimer = access is "academic_secondary" or "historical" or "limited"
                ? "引用时注明非大陆内部战斗条令原文；本条为公开/历史/外部研究材料。\n"
                : "公开媒体或白皮书表述，禁止当作内部《战斗条令/教范》原文引用。\n";

            var zhBody =
                $"【中国文献增补 · {doc.Group}】来源向登记。\n" +
                $"编号：{doc.Id} · origin={origin}\n年份：{year}\n链接：{doc.Url}\n" +
                $"摘要：{doc.SummaryZh}\n" +
                $"主题 topic：{topics}\n梯队 echelon：{echelons}\n访问 access：{access}\n" +
                disclaimer +
                "正文：优先抓取 official_media / white_paper 页面；学术/历史有全文则挂载，否则仅题录。";
            var enBody =
                $"[CN supplement · {doc.Group}] provenance registry.\n" +
                $"Id: {doc.Id} · origin={origin}\nYear: {year}\nURL: {doc.Url}\n" +
                $"Summary: {doc.SummaryEn}\n" +
                $"Topics: {topics}\nEchelons: {echelons}\nAccess: {access}\n" +
                "Open media / white paper / secondary / historical only — not internal PLA combat manuals.";

            await UpsertSourceRowAsync(
                $"military.core.{doc.Id}",
                "military",
                doc.Title ?? doc.Id,
                doc.Title ?? doc.Id,
                zhBody,
                enBody,
                minTrust: 1,
                section: doc.Group ?? "CN",
                sortOrder: sort + (doc.Priority ?? 1) * 10,
                ct);
            sort++;
        }

        await _db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Fetch fetch=true CN catalog URLs (official_media / white_paper / open historical) into ExtractedText.
    /// </summary>
    public async Task<IReadOnlyList<RemoteFetchResult>> FetchRemoteCatalogPagesAsync(CancellationToken ct = default)
    {
        var paths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Data", "curriculum", "cn_sources_catalog.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "Data", "curriculum", "cn_sources_catalog.json"),
        };

        MilitaryCoreFile? file = null;
        foreach (var path in paths)
        {
            if (!File.Exists(path)) continue;
            try
            {
                file = JsonSerializer.Deserialize<MilitaryCoreFile>(await File.ReadAllTextAsync(path, ct), JsonOpts);
                if (file?.Documents is { Count: > 0 }) break;
            }
            catch { /* try next */ }
        }

        if (file?.Documents is not { Count: > 0 })
            return Array.Empty<RemoteFetchResult>();

        string[] priority =
        [
            "CN-JFJB-2020-合成营",
            "CN-JFJB-2021-作战运用",
            "CN-81-什么是合成营",
            "CN-WP-2015-战略",
            "CN-JFJB-2020-主动融",
            "CN-81-2016-独立作战型",
        ];

        var fetchable = file.Documents
            .Where(d => d.Fetch == true && !string.IsNullOrWhiteSpace(d.Id) && !string.IsNullOrWhiteSpace(d.Url))
            .OrderBy(d =>
            {
                var i = Array.IndexOf(priority, d.Id);
                return i < 0 ? 1000 + (d.Priority ?? 9) : i;
            })
            .ToList();

        var dumpDir = Path.Combine(Directory.GetCurrentDirectory(), "App_Data", "canal-pdfs");
        Directory.CreateDirectory(dumpDir);

        var client = _httpClientFactory.CreateClient("CanalFetch");
        var extractor = new HabitMaterialTextExtractor();
        var results = new List<RemoteFetchResult>();

        foreach (var doc in fetchable)
        {
            ct.ThrowIfCancellationRequested();
            var docId = doc.Id!;
            var key = $"military.core.{docId}";
            var entry = await _db.CanalKnowledgeEntries.FirstOrDefaultAsync(e => e.EntryKey == key, ct);
            if (entry == null)
            {
                results.Add(new RemoteFetchResult(docId, false, "entry_missing"));
                continue;
            }

            if (!string.IsNullOrWhiteSpace(entry.ExtractedText) && entry.ExtractedText.Length > 800)
            {
                results.Add(new RemoteFetchResult(docId, true, "already_imported", Chars: entry.ExtractedText.Length));
                continue;
            }

            var urls = new List<string> { doc.Url! };
            if (doc.AltUrls is { Count: > 0 })
                urls.AddRange(doc.AltUrls.Where(u => !string.IsNullOrWhiteSpace(u))!);

            string? plain = null;
            string? usedUrl = null;
            string? failReason = null;

            foreach (var url in urls)
            {
                try
                {
                    using var resp = await client.GetAsync(url, ct);
                    if (!resp.IsSuccessStatusCode)
                    {
                        failReason = $"http_{(int)resp.StatusCode}";
                        continue;
                    }

                    var media = resp.Content.Headers.ContentType?.MediaType ?? "";
                    var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
                    if (bytes.Length < 64)
                    {
                        failReason = "too_small";
                        continue;
                    }

                    if (media.Contains("pdf", StringComparison.OrdinalIgnoreCase)
                        || (bytes.Length >= 4 && bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46))
                    {
                        await using var ms = new MemoryStream(bytes);
                        plain = await extractor.ExtractAsync($"{docId}.pdf", ms, ct);
                        usedUrl = url;
                        break;
                    }

                    var html = Encoding.UTF8.GetString(bytes);
                    if (html.Contains("charset=gb", StringComparison.OrdinalIgnoreCase)
                        || html.Contains("gb2312", StringComparison.OrdinalIgnoreCase)
                        || html.Contains("gbk", StringComparison.OrdinalIgnoreCase))
                    {
                        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
                        html = Encoding.GetEncoding("GB18030").GetString(bytes);
                    }

                    if (url.Contains("wikimedia.org/wiki/File:", StringComparison.OrdinalIgnoreCase)
                        || url.Contains("commons.wikimedia.org", StringComparison.OrdinalIgnoreCase))
                    {
                        var pdfUrl = HtmlPageTextExtractor.FindFirstPdfUrl(html, new Uri(url));
                        if (pdfUrl != null)
                        {
                            using var pdfResp = await client.GetAsync(pdfUrl, ct);
                            if (pdfResp.IsSuccessStatusCode)
                            {
                                var pdfBytes = await pdfResp.Content.ReadAsByteArrayAsync(ct);
                                await using var ms = new MemoryStream(pdfBytes);
                                plain = await extractor.ExtractAsync($"{docId}.pdf", ms, ct);
                                usedUrl = pdfUrl;
                                break;
                            }
                        }
                    }

                    plain = HtmlPageTextExtractor.ExtractArticleish(html);
                    if (string.IsNullOrWhiteSpace(plain) || plain.Length < 120)
                    {
                        failReason = "extract_thin";
                        plain = null;
                        continue;
                    }

                    usedUrl = url;
                    break;
                }
                catch (Exception ex)
                {
                    failReason = "exception";
                    _logger.LogWarning(ex, "Fetch failed for {DocId} url {Url}", docId, url);
                }
            }

            if (string.IsNullOrWhiteSpace(plain) || plain.Length < 120)
            {
                results.Add(new RemoteFetchResult(docId, false, failReason ?? "fetch_failed", Url: doc.Url));
                continue;
            }

            var header =
                $"【来源说明】公开页面抓取（access={doc.AccessNote}），非内部战斗条令/教范原文。\n" +
                $"source_id={docId} · origin={doc.OriginCountry ?? "CN"} · url={usedUrl}\n\n";
            var body = header + plain;
            if (body.Length > HabitMaterialTextExtractor.MaxExtractedChars)
                body = body[..HabitMaterialTextExtractor.MaxExtractedChars];

            var fileName = $"{docId}.txt";
            var dumpPath = Path.Combine(dumpDir, fileName);
            await File.WriteAllTextAsync(dumpPath, body, Encoding.UTF8, ct);

            var destDir = Path.Combine(Directory.GetCurrentDirectory(), "App_Data", "canal-knowledge", entry.Id.ToString());
            Directory.CreateDirectory(destDir);
            var destPath = Path.Combine(destDir, fileName);
            File.Copy(dumpPath, destPath, overwrite: true);

            await AttachDocumentAsync(
                entry.Id,
                fileName,
                "text/plain",
                new FileInfo(dumpPath).Length,
                destPath,
                body,
                ct);

            results.Add(new RemoteFetchResult(docId, true, "fetched", Url: usedUrl, Chars: body.Length));
            _logger.LogInformation("Fetched CN source {DocId} ({Chars} chars) from {Url}", docId, body.Length, usedUrl);
        }

        return results;
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

    private async Task SyncMilitaryCoreCatalogAsync(CancellationToken ct)
    {
        var paths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Data", "curriculum", "military_core_catalog.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "Data", "curriculum", "military_core_catalog.json"),
        };

        MilitaryCoreFile? file = null;
        foreach (var path in paths)
        {
            if (!File.Exists(path)) continue;
            try
            {
                file = JsonSerializer.Deserialize<MilitaryCoreFile>(await File.ReadAllTextAsync(path, ct), JsonOpts);
                if (file?.Documents is { Count: > 0 })
                {
                    _logger.LogInformation("Loaded military core catalog ({Count}) from {Path}", file.Documents.Count, path);
                    break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load military_core_catalog from {Path}", path);
            }
        }

        if (file?.Documents is not { Count: > 0 }) return;

        var sort = 200;
        foreach (var portal in file.Portals ?? [])
        {
            if (string.IsNullOrWhiteSpace(portal.Id)) continue;
            await UpsertSourceRowAsync(
                $"portal.core.{portal.Id}",
                "military",
                portal.Name ?? portal.Id,
                portal.Name ?? portal.Id,
                zhBody: $"【B 检索入口】{portal.Name}\nURL：{portal.Url}\n访问：{portal.AccessNote}",
                enBody: $"[Portal B] {portal.Name}\nURL: {portal.Url}\nAccess: {portal.AccessNote}",
                minTrust: 1,
                section: "B",
                sortOrder: sort++,
                ct);
        }

        sort = 300;
        foreach (var doc in file.Documents)
        {
            if (string.IsNullOrWhiteSpace(doc.Id)) continue;
            var topics = string.Join(", ", doc.Topics ?? []);
            var echelons = string.Join(", ", doc.Echelons ?? []);
            var year = doc.Year?.ToString() ?? "n/a";
            var zhBody =
                $"【A 核心文献 · {doc.Group}】优先入库登记（来源向）。\n" +
                $"编号：{doc.Id}\n年份：{year}\n链接：{doc.Url}\n" +
                $"摘要：{doc.SummaryZh}\n" +
                $"主题 topic：{topics}\n梯队 echelon：{echelons}\n访问：{doc.AccessNote}\n" +
                "说明：完整条文需在本条「挂载文献」上传可抽取文本的 PDF；上传后凯娜尔可引用正文。";
            var enBody =
                $"[Core literature · {doc.Group}] provenance registry.\n" +
                $"Id: {doc.Id}\nYear: {year}\nURL: {doc.Url}\n" +
                $"Summary: {doc.SummaryEn}\n" +
                $"Topics: {topics}\nEchelons: {echelons}\nAccess: {doc.AccessNote}\n" +
                "Attach an extractable PDF on this entry so Canal can cite body text.";

            await UpsertSourceRowAsync(
                $"military.core.{doc.Id}",
                "military",
                doc.Title ?? doc.Id,
                doc.Title ?? doc.Id,
                zhBody,
                enBody,
                minTrust: 1,
                section: doc.Group ?? "A",
                sortOrder: sort + (doc.Priority ?? 1) * 10,
                ct);
            sort++;
        }

        await _db.SaveChangesAsync(ct);
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
            // Refresh catalog text for military registry rows (do not wipe uploaded ExtractedText).
            if (string.IsNullOrWhiteSpace(existing.ExtractedText)
                && (existing.Category is "military" or "source" or "portal"
                    || existing.EntryKey.StartsWith("source.", StringComparison.OrdinalIgnoreCase)
                    || existing.EntryKey.StartsWith("portal.", StringComparison.OrdinalIgnoreCase)
                    || existing.EntryKey.StartsWith("military.core.", StringComparison.OrdinalIgnoreCase)
                    || existing.EntryKey.StartsWith("portal.core.", StringComparison.OrdinalIgnoreCase)))
            {
                existing.IsBuiltin = true;
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
            else
            {
                existing.IsBuiltin = true;
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

    private sealed class MilitaryCoreFile
    {
        public List<MilitaryPortal>? Portals { get; set; }
        public List<MilitaryDoc>? Documents { get; set; }
    }

    private sealed class MilitaryPortal
    {
        public string? Id { get; set; }
        public string? Name { get; set; }
        public string? Url { get; set; }
        public string? AccessNote { get; set; }
    }

    private sealed class MilitaryDoc
    {
        public string? Id { get; set; }
        public string? Group { get; set; }
        public string? Title { get; set; }
        public int? Year { get; set; }
        public string? OriginCountry { get; set; }
        public string? Url { get; set; }
        public List<string>? AltUrls { get; set; }
        public string? SummaryZh { get; set; }
        public string? SummaryEn { get; set; }
        public List<string>? Topics { get; set; }
        public List<string>? Echelons { get; set; }
        public string? AccessNote { get; set; }
        public int? Priority { get; set; }
        public bool? Fetch { get; set; }
    }
}
