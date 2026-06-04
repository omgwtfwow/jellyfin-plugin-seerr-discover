using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.SeerrDiscover.Models;

/// <summary>
/// Request body for creating Seerr requests.
/// </summary>
public sealed class SeerrDiscoverRequest
{
    /// <summary>
    /// Gets or sets the media type.
    /// </summary>
    public string MediaType { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the TMDB media id.
    /// </summary>
    public int MediaId { get; set; }

    /// <summary>
    /// Gets or sets the optional TVDB id.
    /// </summary>
    public int? TvdbId { get; set; }

    /// <summary>
    /// Gets or sets the seasons payload for TV requests.
    /// </summary>
    public object? Seasons { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether this is a 4K request.
    /// </summary>
    public bool? Is4K { get; set; }

    /// <summary>
    /// Gets or sets the optional Seerr server id.
    /// </summary>
    public int? ServerId { get; set; }

    /// <summary>
    /// Gets or sets the optional quality/profile id.
    /// </summary>
    public int? ProfileId { get; set; }

    /// <summary>
    /// Gets or sets the optional root folder.
    /// </summary>
    public string? RootFolder { get; set; }

    /// <summary>
    /// Gets or sets the optional language profile id.
    /// </summary>
    public int? LanguageProfileId { get; set; }
}

/// <summary>
/// Redacted plugin configuration returned to the browser config page.
/// </summary>
public sealed class SeerrDiscoverConfigurationDto
{
    /// <summary>
    /// Gets or sets the internal Seerr URL used by Jellyfin.
    /// </summary>
    public string SeerrBaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the public Seerr URL used by browser links.
    /// </summary>
    public string SeerrPublicUrl { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether a Seerr API key is configured.
    /// </summary>
    public bool SeerrApiKeyConfigured { get; set; }

    /// <summary>
    /// Gets or sets the language sent to Seerr.
    /// </summary>
    public string Language { get; set; } = "en";

    /// <summary>
    /// Gets or sets discover cache lifetime in seconds.
    /// </summary>
    public int DiscoverCacheSeconds { get; set; }

    /// <summary>
    /// Gets or sets detail cache lifetime in seconds.
    /// </summary>
    public int DetailsCacheSeconds { get; set; }

    /// <summary>
    /// Gets or sets search cache lifetime in seconds.
    /// </summary>
    public int SearchCacheSeconds { get; set; }

    /// <summary>
    /// Gets or sets user cache lifetime in seconds.
    /// </summary>
    public int UserCacheSeconds { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether requests require mapped Seerr users.
    /// </summary>
    public bool RequireMappedUser { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether requests default to 4K.
    /// </summary>
    public bool DefaultRequest4K { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the trending feed is enabled.
    /// </summary>
    public bool EnableTrending { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the movie feed is enabled.
    /// </summary>
    public bool EnableMovies { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the TV feed is enabled.
    /// </summary>
    public bool EnableTv { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the upcoming feed is enabled.
    /// </summary>
    public bool EnableUpcoming { get; set; }
}

/// <summary>
/// Plugin configuration update from the browser config page.
/// </summary>
public sealed class SeerrDiscoverConfigurationUpdate
{
    /// <summary>
    /// Gets or sets the internal Seerr URL used by Jellyfin.
    /// </summary>
    public string? SeerrBaseUrl { get; set; }

    /// <summary>
    /// Gets or sets the public Seerr URL used by browser links.
    /// </summary>
    public string? SeerrPublicUrl { get; set; }

    /// <summary>
    /// Gets or sets a replacement Seerr API key. Blank preserves the current key unless clear is requested.
    /// </summary>
    public string? SeerrApiKey { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether to clear the stored Seerr API key.
    /// </summary>
    public bool ClearSeerrApiKey { get; set; }

    /// <summary>
    /// Gets or sets the language sent to Seerr.
    /// </summary>
    public string? Language { get; set; }

    /// <summary>
    /// Gets or sets discover cache lifetime in seconds.
    /// </summary>
    public int DiscoverCacheSeconds { get; set; }

    /// <summary>
    /// Gets or sets detail cache lifetime in seconds.
    /// </summary>
    public int DetailsCacheSeconds { get; set; }

    /// <summary>
    /// Gets or sets search cache lifetime in seconds.
    /// </summary>
    public int SearchCacheSeconds { get; set; }

    /// <summary>
    /// Gets or sets user cache lifetime in seconds.
    /// </summary>
    public int UserCacheSeconds { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether requests require mapped Seerr users.
    /// </summary>
    public bool RequireMappedUser { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether requests default to 4K.
    /// </summary>
    public bool DefaultRequest4K { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the trending feed is enabled.
    /// </summary>
    public bool EnableTrending { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the movie feed is enabled.
    /// </summary>
    public bool EnableMovies { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the TV feed is enabled.
    /// </summary>
    public bool EnableTv { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the upcoming feed is enabled.
    /// </summary>
    public bool EnableUpcoming { get; set; }
}

/// <summary>
/// Mapped Seerr user information.
/// </summary>
public sealed class MappedSeerrUser
{
    /// <summary>
    /// Gets or sets the Seerr user id.
    /// </summary>
    [JsonPropertyName("id")]
    public int Id { get; set; }

    /// <summary>
    /// Gets or sets the username.
    /// </summary>
    [JsonPropertyName("username")]
    public string? Username { get; set; }

    /// <summary>
    /// Gets or sets the email.
    /// </summary>
    [JsonPropertyName("email")]
    public string? Email { get; set; }
}
