namespace backend.Services;

/// <summary>Friendly Canal-style diagnosis when image chat cannot proceed.</summary>
public static class VisionModelGuide
{
    public enum VisionCapability
    {
        LikelyYes,
        LikelyNo,
        Unknown
    }

    public static VisionCapability Classify(string? model)
    {
        if (string.IsNullOrWhiteSpace(model)) return VisionCapability.Unknown;
        var m = model.Trim().ToLowerInvariant();

        if (m.Contains("vision", StringComparison.Ordinal)
            || m.Contains("-vl", StringComparison.Ordinal)
            || m.Contains("_vl", StringComparison.Ordinal)
            || m.Contains("gpt-4o", StringComparison.Ordinal)
            || m.Contains("gpt-4.1", StringComparison.Ordinal)
            || m.Contains("gpt-5", StringComparison.Ordinal)
            || m.Contains("gemini", StringComparison.Ordinal)
            || m.Contains("claude-3", StringComparison.Ordinal)
            || m.Contains("claude-4", StringComparison.Ordinal)
            || m.Contains("claude-sonnet-4", StringComparison.Ordinal)
            || m.Contains("glm-4v", StringComparison.Ordinal)
            || m.Contains("qwen2-vl", StringComparison.Ordinal)
            || m.Contains("qwen-vl", StringComparison.Ordinal)
            || m.Contains("qwen2.5-vl", StringComparison.Ordinal)
            || m.Contains("llava", StringComparison.Ordinal)
            || m.Contains("pixtral", StringComparison.Ordinal))
            return VisionCapability.LikelyYes;

        if (ChatImageHelper.LikelyNonVisionModel(model))
            return VisionCapability.LikelyNo;

        return VisionCapability.Unknown;
    }

    public static string BuildDiagnosisReply(string model, string? baseUrl, bool zh, string? apiHint = null)
    {
        var label = string.IsNullOrWhiteSpace(model) ? "(未填写)" : model.Trim();
        var cap = Classify(model);
        var host = DescribeHost(baseUrl);

        if (zh)
        {
            var capLine = cap switch
            {
                VisionCapability.LikelyYes => "✅ 按名字看，**可能支持识图**（视觉/多模态）。若仍然失败，多半是 Key/Base URL 与模型不匹配，或图片过大。",
                VisionCapability.LikelyNo => "❌ 按名字看，这是**纯文本模型**，通常**看不懂图片**——所以我会像只收到空舞台占位一样。",
                _ => "❔ 我没法从名字百分百断定。很多网关同名模型其实不带视觉；若刚才失败，请换成明确的视觉模型。"
            };

            var extra = string.IsNullOrWhiteSpace(apiHint)
                ? ""
                : $"\n\n接口侧线索：`{Truncate(apiHint, 180)}`";

            return $"""
                欸，图片这条我先帮你做个**通道自检**，不甩冷冰冰的报错～

                ## 当前配置
                - 模型：`{label}`
                - 接口：{host}
                - 视觉判断：{capLine}
                {extra}

                ## 想用识图时可以怎么换
                打开 **个人资料 → AI 助手**，改「模型」名（必要时同步改 Base URL / API Key）：

                1. **OpenAI 视觉** — `gpt-4o-mini` / `gpt-4o`
                   - 视觉说明：https://platform.openai.com/docs/guides/images-vision
                   - 模型列表：https://platform.openai.com/docs/models
                2. **通义千问 VL** — 如 `qwen-vl-max` / `qwen2.5-vl-plus`
                   - https://help.aliyun.com/zh/model-studio/vision
                3. **智谱 GLM-4V** — 名称含 `glm-4v`
                   - https://open.bigmodel.cn/dev/api/normal-model/glm-4v
                4. **Google Gemini**（多模态）
                   - https://ai.google.dev/gemini-api/docs/vision
                5. **Anthropic Claude**（3.5/4 等支持看图）
                   - https://docs.anthropic.com/en/docs/build-with-claude/vision

                换成带 **vision / vl / 4o / gemini** 这类字样的模型后，再把图片丢给我就行。列表、代码块我也可以好好排版哦～
                """;
        }

        var capEn = cap switch
        {
            VisionCapability.LikelyYes => "✅ Name looks like a **vision/multimodal** model. If it still failed, check Key/Base URL mismatch or image size.",
            VisionCapability.LikelyNo => "❌ Name looks like a **text-only** model — it usually **cannot see images** (empty-placeholder feeling).",
            _ => "❔ I cannot be 100% sure from the name. If the call failed, switch to an explicit vision model."
        };

        var extraEn = string.IsNullOrWhiteSpace(apiHint)
            ? ""
            : $"\n\nProvider hint: `{Truncate(apiHint, 180)}`";

        return $"""
            Quick channel check on my side — no cold error dump:

            ## Current setup
            - Model: `{label}`
            - Endpoint: {host}
            - Vision: {capEn}
            {extraEn}

            ## Vision-friendly options
            In **Profile → AI Assistant**, change the model (and Base URL / API key if needed):

            1. **OpenAI vision** — `gpt-4o-mini` / `gpt-4o`
               - https://platform.openai.com/docs/guides/images-vision
               - https://platform.openai.com/docs/models
            2. **Qwen VL** — e.g. `qwen-vl-max` / `qwen2.5-vl-plus`
               - https://help.aliyun.com/zh/model-studio/vision
            3. **Zhipu GLM-4V** — names containing `glm-4v`
               - https://open.bigmodel.cn/dev/api/normal-model/glm-4v
            4. **Google Gemini** (multimodal)
               - https://ai.google.dev/gemini-api/docs/vision
            5. **Anthropic Claude** (3.5/4 vision)
               - https://docs.anthropic.com/en/docs/build-with-claude/vision

            After switching to a **vision / vl / 4o / gemini** model, send the image again.
            """;
    }

    public static string BuildImageSoftFailReply(bool zh, string reason)
    {
        if (zh)
        {
            return $"""
                这张图我没接稳（{reason}）。

                试试：
                - 换成较小的 **jpg / png / webp**（建议压缩到约 1MB 内）
                - 确认 **个人资料 → AI 助手** 用的是视觉模型（如 `gpt-4o-mini`）

                想看各家视觉模型文档，也可以直接再发一张图——若模型不对，我会用更清楚的自检清单告诉你怎么换。
                """;
        }

        return $"""
            I couldn't take that image ({reason}).

            Try:
            - a smaller **jpg / png / webp** (ideally under ~1MB)
            - a vision model in **Profile → AI Assistant** (e.g. `gpt-4o-mini`)

            Send another image anytime — if the model can't see, I'll give you a clear checklist with links.
            """;
    }

    private static string DescribeHost(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl)) return "`api.openai.com` (default)";
        try
        {
            var u = new Uri(baseUrl.Trim());
            return $"`{u.Host}`";
        }
        catch
        {
            return $"`{Truncate(baseUrl.Trim(), 48)}`";
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..max] + "…";
}
