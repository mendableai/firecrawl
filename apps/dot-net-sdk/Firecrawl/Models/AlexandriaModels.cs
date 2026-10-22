using System.Text.Json;
using System.Text.Json.Serialization;

namespace Firecrawl.Models;

/// <summary>
/// One data provider tool call (Alexandria): the provider, its capability, and the tool's options.
/// </summary>
public class AlexandriaCall
{
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = "";

    [JsonPropertyName("capability")]
    public string Capability { get; set; } = "";

    /// <summary>The capability version (semver). Omit for the current version.</summary>
    [JsonPropertyName("version")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Version { get; set; }

    [JsonPropertyName("options")]
    public Dictionary<string, object>? Options { get; set; }
}

/// <summary>
/// The error of a failed data provider tool call. A failed call does not fail the request.
/// </summary>
public class AlexandriaError
{
    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("status")]
    public int? Status { get; set; }
}

/// <summary>
/// The result of one data provider tool call: its data, or its error.
/// </summary>
public class AlexandriaResult
{
    [JsonPropertyName("provider")]
    public string? Provider { get; set; }

    [JsonPropertyName("capability")]
    public string? Capability { get; set; }

    [JsonPropertyName("creditsCost")]
    public int? CreditsCost { get; set; }

    [JsonPropertyName("data")]
    public JsonElement? Data { get; set; }

    [JsonPropertyName("records")]
    public int? Records { get; set; }

    [JsonPropertyName("upstreamStatus")]
    public int? UpstreamStatus { get; set; }

    [JsonPropertyName("error")]
    public AlexandriaError? Error { get; set; }
}

/// <summary>
/// The results of a data provider tool request, in call order, the credits it cost,
/// and the <c>x-request-id</c> it was sent with.
/// </summary>
public class AlexandriaScrapeData
{
    [JsonPropertyName("requestId")]
    public string RequestId { get; set; } = "";

    [JsonPropertyName("alexandria")]
    public List<AlexandriaResult> Alexandria { get; set; } = new();

    [JsonPropertyName("creditsCost")]
    public int CreditsCost { get; set; }
}

internal class AlexandriaResponseData
{
    [JsonPropertyName("alexandria")]
    public List<AlexandriaResult>? Alexandria { get; set; }

    [JsonPropertyName("creditsCost")]
    public int? CreditsCost { get; set; }
}
