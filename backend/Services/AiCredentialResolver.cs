namespace backend.Services;

/// <summary>
/// Resolves OpenAI-compatible credentials from server config only.
/// Client-supplied API keys are never accepted — they would be relayed to a third party.
/// Set <c>Ai__ApiKey</c> (and optionally <c>Ai__BaseUrl</c> / <c>Ai__Model</c>) on the host.
/// </summary>
public sealed class AiCredentialResolver
{
    public const string DefaultBaseUrl = "https://api.openai.com/v1";
    public const string DefaultModel = "gpt-4o-mini";

    private readonly IConfiguration _configuration;

    public AiCredentialResolver(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public ResolvedAiCredentials Resolve(string? preferredModel = null)
    {
        var apiKey = _configuration["Ai:ApiKey"]?.Trim();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "AI is not configured on the server. Set Ai__ApiKey (and optional Ai__BaseUrl / Ai__Model).");
        }

        var baseUrl = _configuration["Ai:BaseUrl"]?.Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(baseUrl))
            baseUrl = DefaultBaseUrl;

        var model = preferredModel?.Trim();
        if (string.IsNullOrWhiteSpace(model))
            model = _configuration["Ai:Model"]?.Trim();
        if (string.IsNullOrWhiteSpace(model))
            model = DefaultModel;

        return new ResolvedAiCredentials(apiKey, baseUrl, model);
    }
}

public readonly record struct ResolvedAiCredentials(string ApiKey, string BaseUrl, string Model);
