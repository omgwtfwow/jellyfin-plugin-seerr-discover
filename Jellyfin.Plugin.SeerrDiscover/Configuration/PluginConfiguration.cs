using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.SeerrDiscover.Configuration;

/// <summary>
/// Persistent configuration for the Seerr Discover plugin.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets the internal Seerr API base URL.
    /// </summary>
    public string SeerrBaseUrl { get; set; } = "http://seerr:5055";

    /// <summary>
    /// Gets or sets the public Seerr URL used for browser "Open in Seerr" links.
    /// </summary>
    public string SeerrPublicUrl { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Seerr API key. This value is only used server-side.
    /// </summary>
    public string SeerrApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the language passed to Seerr/TMDB-backed endpoints.
    /// </summary>
    public string Language { get; set; } = "en";

    /// <summary>
    /// Gets or sets the discover cache TTL in seconds.
    /// </summary>
    public int DiscoverCacheSeconds { get; set; } = 600;

    /// <summary>
    /// Gets or sets the detail cache TTL in seconds.
    /// </summary>
    public int DetailsCacheSeconds { get; set; } = 300;

    /// <summary>
    /// Gets or sets the search cache TTL in seconds.
    /// </summary>
    public int SearchCacheSeconds { get; set; } = 60;

    /// <summary>
    /// Gets or sets the mapped user/quota cache TTL in seconds.
    /// </summary>
    public int UserCacheSeconds { get; set; } = 60;

    /// <summary>
    /// Gets or sets a value indicating whether request creation must use the mapped Seerr user.
    /// </summary>
    public bool RequireMappedUser { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether 4K requests are created by default.
    /// </summary>
    public bool DefaultRequest4K { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the trending rail is enabled.
    /// </summary>
    public bool EnableTrending { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the movies rail is enabled.
    /// </summary>
    public bool EnableMovies { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the TV rail is enabled.
    /// </summary>
    public bool EnableTv { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the upcoming movies rail is enabled.
    /// </summary>
    public bool EnableUpcoming { get; set; } = true;
}
