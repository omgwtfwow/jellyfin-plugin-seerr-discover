using System.Collections.Generic;
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
    /// Gets or sets a value indicating whether Seerr results are injected into Jellyfin native search.
    /// </summary>
    public bool EnableNativeSearchIntegration { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether 4K requests are created by default.
    /// </summary>
    public bool DefaultRequest4K { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the legacy mixed trending rail is enabled.
    /// </summary>
    public bool EnableTrending { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether split trending rail settings have been saved.
    /// </summary>
    public bool UseSplitTrendingRailSettings { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the trending movies rail is enabled.
    /// </summary>
    public bool EnableTrendingMovies { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the trending TV rail is enabled.
    /// </summary>
    public bool EnableTrendingTv { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the popular movies rail is enabled.
    /// </summary>
    public bool EnableMovies { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the popular TV rail is enabled.
    /// </summary>
    public bool EnableTv { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the upcoming movies rail is enabled.
    /// </summary>
    public bool EnableUpcoming { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the upcoming TV rail is enabled.
    /// </summary>
    public bool EnableUpcomingTv { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether recent server requests are shown.
    /// </summary>
    public bool EnableRecentlyRequested { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether deduped popular server requests are shown.
    /// </summary>
    public bool EnablePopularWithServer { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether similar titles are shown in detail modals.
    /// </summary>
    public bool EnableDetailSimilar { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether recommended titles are shown in detail modals.
    /// </summary>
    public bool EnableDetailRecommended { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether collection entries are shown in detail modals.
    /// </summary>
    public bool EnableDetailCollections { get; set; }

    /// <summary>
    /// Gets or sets optional admin-configured Discover rails.
    /// </summary>
    public List<SeerrExtraRail> ExtraRails { get; set; } = new();
}

/// <summary>
/// Persistent optional Discover rail selection.
/// </summary>
public sealed class SeerrExtraRail
{
    /// <summary>
    /// Gets or sets the stable generated rail id.
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the rail kind, such as genre, studio, network, language, or keyword.
    /// </summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the media type, movie or tv.
    /// </summary>
    public string MediaType { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the kind-specific id or code.
    /// </summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the display title.
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether the rail is enabled.
    /// </summary>
    public bool Enabled { get; set; }
}
