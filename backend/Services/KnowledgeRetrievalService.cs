using System.Text.RegularExpressions;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

/// <summary>Retrieve study materials + memories for Canal (text or vision grounding).</summary>
public class KnowledgeRetrievalService
{
    public const int MaxSnippetChars = 10_000;

    private readonly AppDbContext _db;

    public KnowledgeRetrievalService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<string> BuildContextBlockAsync(
        int userId,
        string zoneType,
        int habitId,
        string? query,
        bool zh,
        CancellationToken ct = default)
    {
        var (zone, hid) = ChatZones.Normalize(zoneType, habitId);
        var terms = ExtractTerms(query);

        var materialsQuery = _db.HabitMaterials
            .Where(m => m.UserId == userId && m.ExtractedText != "");

        int? groupId = null;
        if (zone == ChatZones.Habit && hid > 0)
        {
            materialsQuery = materialsQuery.Where(m => m.HabitId == hid);
            groupId = await _db.Habits
                .Where(h => h.Id == hid && h.UserId == userId)
                .Select(h => h.GroupId)
                .FirstOrDefaultAsync(ct);
        }

        var materials = await materialsQuery
            .OrderByDescending(m => m.CreatedAt)
            .Take(24)
            .Select(m => new { m.FileName, m.HabitId, m.ExtractedText })
            .ToListAsync(ct);

        var materialRows = materials
            .Select(m => (FileName: m.FileName, HabitId: m.HabitId, Text: m.ExtractedText))
            .ToList();

        if (groupId is int gid && gid > 0)
        {
            var groupMats = await _db.HabitGroupMaterials
                .Where(m => m.UserId == userId && m.GroupId == gid && m.ExtractedText != "")
                .OrderByDescending(m => m.CreatedAt)
                .Take(24)
                .Select(m => new { m.FileName, m.ExtractedText })
                .ToListAsync(ct);
            materialRows.AddRange(groupMats.Select(m => (FileName: $"group:{m.FileName}", HabitId: hid, Text: m.ExtractedText)));
        }

        IEnumerable<(string FileName, int HabitId, string Text, int Score)> scoredMaterials = materialRows
            .Select(m =>
            {
                var score = terms.Count == 0
                    ? 1
                    : terms.Count(t =>
                        m.FileName.Contains(t, StringComparison.OrdinalIgnoreCase)
                        || m.Text.Contains(t, StringComparison.OrdinalIgnoreCase));
                return (m.FileName, m.HabitId, m.Text, score);
            })
            .Where(x => terms.Count == 0 || x.score > 0)
            .OrderByDescending(x => x.score)
            .ThenByDescending(x => x.HabitId == hid ? 1 : 0);

        if (terms.Count == 0 && zone == ChatZones.Habit)
            scoredMaterials = materialRows.Select(m => (m.FileName, m.HabitId, m.Text, 1));

        var materialLines = new List<string>();
        var used = 0;
        foreach (var m in scoredMaterials.Take(6))
        {
            var chunk = Truncate(m.Text, 2200);
            materialLines.Add($"[{m.FileName}] {chunk}");
            used += chunk.Length;
            if (used >= MaxSnippetChars) break;
        }

        var memories = await _db.UserMemories
            .Where(m => m.UserId == userId && !m.IsDeleted && m.ZoneType == zone && m.HabitId == hid)
            .ToListAsync(ct);

        var memoryLines = memories
            .Select(m => new
            {
                m.Type,
                m.Key,
                m.Content,
                m.Importance,
                Score = m.Importance * 10
                    + (terms.Count == 0 ? 0 : terms.Count(t =>
                        m.Key.Contains(t, StringComparison.OrdinalIgnoreCase)
                        || m.Content.Contains(t, StringComparison.OrdinalIgnoreCase)) * 5)
            })
            .Where(x => terms.Count == 0 || x.Score > x.Importance * 10)
            .OrderByDescending(x => x.Score)
            .Take(6)
            .Select(x => $"- [{x.Type}/{x.Key}] {x.Content}")
            .ToList();

        if (materialLines.Count == 0 && memoryLines.Count == 0)
            return zh ? "（当前知识库与记忆暂无匹配内容）" : "(No matching knowledge or memories.)";

        var sb = new System.Text.StringBuilder();
        if (memoryLines.Count > 0)
        {
            sb.AppendLine(zh ? "相关记忆：" : "Related memories:");
            foreach (var line in memoryLines) sb.AppendLine(line);
        }
        if (materialLines.Count > 0)
        {
            sb.AppendLine(zh ? "学习资料摘录：" : "Study material excerpts:");
            foreach (var line in materialLines) sb.AppendLine(line);
        }
        return Truncate(sb.ToString(), MaxSnippetChars);
    }

    public async Task<string> SearchAsync(
        int userId,
        string zoneType,
        int habitId,
        string query,
        bool zh,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
            return zh ? "请提供检索关键词。" : "Provide a search query.";
        return await BuildContextBlockAsync(userId, zoneType, habitId, query, zh, ct);
    }

    private static HashSet<string> ExtractTerms(string? text)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(text)) return set;
        foreach (Match m in Regex.Matches(text.ToLowerInvariant(), @"[\p{L}\p{N}]{2,}"))
        {
            if (m.Value.Length >= 2) set.Add(m.Value);
            if (set.Count >= 20) break;
        }
        return set;
    }

    private static string Truncate(string text, int max)
    {
        if (string.IsNullOrEmpty(text) || text.Length <= max) return text ?? "";
        return text[..max] + "…";
    }
}
