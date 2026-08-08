using System.Text.Json;
using System.Text.Json.Serialization;

namespace backend.Services;

public class SourcePortal
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Url { get; set; } = "";
    public string AccessNote { get; set; } = "public";
}

public class SourceDocument
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public int? Year { get; set; }
    public string OriginCountry { get; set; } = "";
    public string DocType { get; set; } = "";
    public List<string> Echelons { get; set; } = new();
    public List<string> Topics { get; set; } = new();
    public string UrlOrLocator { get; set; } = "";
    public string AccessNote { get; set; } = "public";
    public string Section { get; set; } = "";
}

public class SourceCatalogFile
{
    public string? Note { get; set; }
    public List<SourcePortal> Portals { get; set; } = new();
    public List<SourceDocument> Documents { get; set; } = new();
}

/// <summary>
/// Design §7–8 literature registry: provenance only, no extracted knowledge chunks.
/// Retrieval filter: echelon + topic (not by country).
/// </summary>
public class CurriculumSourceCatalog
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly ILogger<CurriculumSourceCatalog> _logger;
    private readonly Lazy<SourceCatalogFile> _file;

    public CurriculumSourceCatalog(ILogger<CurriculumSourceCatalog> logger)
    {
        _logger = logger;
        _file = new Lazy<SourceCatalogFile>(Load);
    }

    public IReadOnlyList<SourcePortal> Portals => _file.Value.Portals;
    public IReadOnlyList<SourceDocument> Documents => _file.Value.Documents;

    public SourceDocument? GetById(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        var bare = id.Trim();
        if (bare.StartsWith("doc:", StringComparison.OrdinalIgnoreCase))
            bare = bare[4..];
        var hash = bare.IndexOf('#');
        if (hash >= 0) bare = bare[..hash];
        return Documents.FirstOrDefault(d => d.Id.Equals(bare, StringComparison.OrdinalIgnoreCase));
    }

    public IReadOnlyList<SourceDocument> Search(string? echelon = null, string? topic = null)
    {
        IEnumerable<SourceDocument> q = Documents;
        if (!string.IsNullOrWhiteSpace(echelon))
            q = q.Where(d => d.Echelons.Any(e => e.Equals(echelon, StringComparison.OrdinalIgnoreCase)));
        if (!string.IsNullOrWhiteSpace(topic))
            q = q.Where(d => d.Topics.Any(t => t.Equals(topic, StringComparison.OrdinalIgnoreCase)));
        return q.ToList();
    }

    private SourceCatalogFile Load()
    {
        var paths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Data", "curriculum", "source_catalog.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "Data", "curriculum", "source_catalog.json"),
        };
        foreach (var path in paths)
        {
            if (!File.Exists(path)) continue;
            try
            {
                var raw = File.ReadAllText(path);
                var file = JsonSerializer.Deserialize<SourceCatalogFile>(raw, JsonOpts);
                if (file != null)
                {
                    _logger.LogInformation(
                        "Loaded Canal source catalog: {Docs} documents, {Portals} portals from {Path}",
                        file.Documents.Count, file.Portals.Count, path);
                    return file;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load source catalog from {Path}", path);
            }
        }

        _logger.LogWarning("Canal source_catalog.json missing — empty registry");
        return new SourceCatalogFile();
    }
}
