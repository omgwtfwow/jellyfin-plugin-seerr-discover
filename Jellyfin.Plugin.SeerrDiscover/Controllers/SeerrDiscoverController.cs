using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.SeerrDiscover.Configuration;
using Jellyfin.Plugin.SeerrDiscover.Models;
using Jellyfin.Plugin.SeerrDiscover.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SeerrDiscover.Controllers;

/// <summary>
/// Authenticated Jellyfin proxy endpoints for Seerr Discover.
/// </summary>
[ApiController]
[Route("SeerrDiscover")]
[Authorize]
public sealed class SeerrDiscoverController : ControllerBase
{
    private const string JellyfinUserIdClaim = "Jellyfin-UserId";
    private const string ArtworkLayoutVertical = "vertical";
    private const string ArtworkLayoutHorizontal = "horizontal";

    private static readonly (string Id, string Title, string Feed)[] DiscoverRailDefinitions =
    {
        ("trending-movies", "Trending Movies", "trending-movies"),
        ("trending-tv", "Trending TV", "trending-tv"),
        ("movies", "Popular Movies", "movies"),
        ("tv", "Popular TV", "tv"),
        ("upcoming", "Upcoming Movies", "upcoming"),
        ("upcoming-tv", "Upcoming TV", "upcoming-tv")
    };

    private static readonly (string Id, string Title, string Feed)[] RequestRailDefinitions =
    {
        ("recently-requested", "Recently Requested", "recently-requested"),
        ("server-popular", "Popular With This Server", "server-popular")
    };

    private static readonly (string Id, string Title)[] DetailRailDefinitions =
    {
        ("similar", "Similar"),
        ("recommended", "Recommended")
    };

    private static readonly (string Id, string Name)[] CuratedNetworks =
    {
        ("49", "HBO"),
        ("213", "Netflix"),
        ("1024", "Amazon"),
        ("2739", "Disney+"),
        ("453", "Hulu"),
        ("2552", "Apple TV+"),
        ("4330", "Paramount+"),
        ("3353", "Peacock"),
        ("3186", "Max"),
        ("174", "AMC"),
        ("16", "CBS"),
        ("19", "FOX"),
        ("2", "ABC"),
        ("6", "NBC"),
        ("67", "Showtime"),
        ("318", "Starz")
    };

    private sealed record DiscoverRail(string Id, string Title, string Feed, string ArtworkLayout);

    private sealed record DetailRail(string Id, string Title, string ArtworkLayout);

    private sealed record RequestRailSeed(string MediaType, int TmdbId, int Count, int Position);

    private readonly ISeerrClient _seerrClient;
    private readonly ISeerrDiscoverCache _cache;

    /// <summary>
    /// Initializes a new instance of the <see cref="SeerrDiscoverController"/> class.
    /// </summary>
    /// <param name="seerrClient">Seerr client.</param>
    /// <param name="cache">Cache.</param>
    public SeerrDiscoverController(ISeerrClient seerrClient, ISeerrDiscoverCache cache)
    {
        _seerrClient = seerrClient;
        _cache = cache;
    }

    /// <summary>
    /// Serves the browser integration asset.
    /// </summary>
    /// <returns>JavaScript asset.</returns>
    [AllowAnonymous]
    [HttpGet("assets/discover.js")]
    [Produces("text/javascript")]
    public ActionResult GetDiscoverAsset()
        => GetEmbeddedJavaScript($"{typeof(Plugin).Namespace}.Web.discover.js", "Embedded Discover asset is missing.");

    /// <summary>
    /// Serves the plugin configuration page controller asset.
    /// </summary>
    /// <returns>JavaScript asset.</returns>
    [AllowAnonymous]
    [HttpGet("assets/configPage.js")]
    [Produces("text/javascript")]
    public ActionResult GetConfigPageAsset()
        => GetEmbeddedJavaScript($"{typeof(Plugin).Namespace}.Web.configPage.js", "Embedded config page asset is missing.");

    private ActionResult GetEmbeddedJavaScript(string resourceName, string missingMessage)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound(missingMessage);
        }

        using var reader = new StreamReader(stream);
        return Content(reader.ReadToEnd(), "text/javascript");
    }

    /// <summary>
    /// Checks Seerr connectivity and plugin state.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Health response.</returns>
    [HttpGet("health")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> GetHealth(CancellationToken cancellationToken)
    {
        try
        {
            var publicSettings = await _seerrClient.GetHealthAsync(cancellationToken).ConfigureAwait(false);
            return new JsonResult(new
            {
                ok = true,
                seerr = JsonDocument.Parse(publicSettings).RootElement.Clone(),
                configured = !string.IsNullOrWhiteSpace(Plugin.Instance?.Configuration.SeerrApiKey),
                cacheGeneration = _cache.Generation
            });
        }
        catch (InvalidOperationException ex)
        {
            return BuildConfigurationErrorResponse(ex);
        }
    }

    /// <summary>
    /// Gets redacted plugin configuration for the admin page.
    /// </summary>
    [HttpGet("config")]
    [Authorize(Roles = "Administrator")]
    [Produces("application/json")]
    public ActionResult GetConfiguration()
        => new JsonResult(ToConfigurationDto(Plugin.Instance?.Configuration ?? new PluginConfiguration()));

    /// <summary>
    /// Updates plugin configuration from the admin page.
    /// </summary>
    [HttpPost("config")]
    [Authorize(Roles = "Administrator")]
    [Produces("application/json")]
    public ActionResult UpdateConfiguration([FromBody] SeerrDiscoverConfigurationUpdate update)
    {
        if (Plugin.Instance is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                error = "plugin_unavailable",
                message = "Seerr Discover plugin is not available yet."
            });
        }

        var config = Plugin.Instance.Configuration;
        ApplyConfigurationUpdate(config, update);
        Plugin.Instance.UpdateConfiguration(config);
        _cache.InvalidateAfterRequest();
        return new JsonResult(ToConfigurationDto(config));
    }

    /// <summary>
    /// Gets non-secret client behavior flags for the browser asset.
    /// </summary>
    [HttpGet("client-config")]
    [Produces("application/json")]
    public ActionResult GetClientConfiguration()
    {
        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return new JsonResult(new
        {
            enableNativeSearchIntegration = config.EnableNativeSearchIntegration,
            detailRails = new
            {
                similar = config.EnableDetailSimilar,
                recommended = config.EnableDetailRecommended,
                rails = BuildDetailRails(config)
                    .Select(rail => new
                    {
                        id = rail.Id,
                        title = rail.Title,
                        enabled = IsDetailRailEnabled(config, rail.Id),
                        artworkLayout = rail.ArtworkLayout
                    })
            },
            discoverRails = BuildDiscoverRails(config)
                .Select(rail => new { id = rail.Id, title = rail.Title, feed = rail.Feed, artworkLayout = rail.ArtworkLayout }),
            seerrPublicUrl = NormalizedSeerrPublicUrl()
        });
    }

    /// <summary>
    /// Gets admin-only rail picker options.
    /// </summary>
    [HttpGet("rail-options")]
    [Authorize(Roles = "Administrator")]
    [Produces("application/json")]
    public async Task<ActionResult> GetRailOptions(
        [FromQuery] string kind,
        [FromQuery] string mediaType = "movie",
        [FromQuery] string? query = null,
        [FromQuery] int page = 1,
        CancellationToken cancellationToken = default)
    {
        var normalizedKind = NormalizeToken(kind);
        var normalizedMediaType = NormalizeMediaType(mediaType);
        try
        {
            return normalizedKind switch
            {
                "genre" when normalizedMediaType is not null => Content(await _seerrClient.GetGenresAsync(normalizedMediaType, cancellationToken).ConfigureAwait(false), "application/json"),
                "language" => Content(await _seerrClient.GetLanguagesAsync(cancellationToken).ConfigureAwait(false), "application/json"),
                "studio" when IsPositiveInt(query ?? string.Empty) => Content(BuildSingleResultJson(await _seerrClient.GetStudioAsync(int.Parse(query!, CultureInfo.InvariantCulture), cancellationToken).ConfigureAwait(false)), "application/json"),
                "studio" when !string.IsNullOrWhiteSpace(query) => Content(await _seerrClient.SearchCompaniesAsync(query.Trim(), page, cancellationToken).ConfigureAwait(false), "application/json"),
                "keyword" when !string.IsNullOrWhiteSpace(query) => Content(await _seerrClient.SearchKeywordsAsync(query.Trim(), page, cancellationToken).ConfigureAwait(false), "application/json"),
                "network" when IsPositiveInt(query ?? string.Empty) => Content(BuildSingleResultJson(await _seerrClient.GetNetworkAsync(int.Parse(query!, CultureInfo.InvariantCulture), cancellationToken).ConfigureAwait(false)), "application/json"),
                "network" => new JsonResult(new { results = CuratedNetworks.Select(network => new { id = network.Id, name = network.Name }) }),
                _ => BadRequest(new { error = "invalid_rail_options", message = "Unsupported rail option request." })
            };
        }
        catch (SeerrHttpException ex)
        {
            return BuildSeerrErrorResponse(ex);
        }
        catch (InvalidOperationException ex)
        {
            return BuildConfigurationErrorResponse(ex);
        }
    }

    /// <summary>
    /// Gets a Seerr discover feed.
    /// </summary>
    [HttpGet("discover")]
    [Produces("application/json")]
    public async Task<ActionResult> GetDiscover(
        [FromQuery] string feed = "trending",
        [FromQuery] int page = 1,
        [FromQuery] string? mediaType = null,
        CancellationToken cancellationToken = default)
    {
        if (!IsFeedEnabled(Plugin.Instance?.Configuration, feed, mediaType))
        {
            return BadRequest(new { error = "feed_disabled", message = "This feed is disabled in plugin configuration." });
        }

        var key = string.Join(':', "discover", feed, Math.Max(page, 1), mediaType ?? string.Empty);
        var normalizedFeed = NormalizeFeed(feed);
        if (normalizedFeed is "recently-requested" or "server-popular")
        {
            return await BuildJsonResponseAsync(
                () => _cache.GetOrCreateAsync(
                    key,
                    Seconds(Plugin.Instance?.Configuration.DiscoverCacheSeconds ?? 600),
                    () => BuildRequestRailJsonAsync(normalizedFeed, page, cancellationToken))).ConfigureAwait(false);
        }

        return await BuildJsonResponseAsync(
            () => _cache.GetOrCreateAsync(
                key,
                Seconds(Plugin.Instance?.Configuration.DiscoverCacheSeconds ?? 600),
                () => _seerrClient.GetDiscoverAsync(normalizedFeed, page, mediaType, cancellationToken))).ConfigureAwait(false);
    }

    /// <summary>
    /// Gets optional detail page related rails.
    /// </summary>
    [HttpGet("related/{mediaType}/{tmdbId:int}")]
    [Produces("application/json")]
    public async Task<ActionResult> GetRelated(
        [FromRoute] string mediaType,
        [FromRoute] int tmdbId,
        CancellationToken cancellationToken)
    {
        var normalized = NormalizeMediaType(mediaType);
        if (normalized is null || tmdbId <= 0)
        {
            return BadRequest(new { error = "invalid_media", message = "mediaType and tmdbId are required." });
        }

        var key = string.Join(':', "related", normalized, tmdbId.ToString(CultureInfo.InvariantCulture), _cache.Generation.ToString(CultureInfo.InvariantCulture));
        return await BuildJsonResponseAsync(
            () => _cache.GetOrCreateAsync(
                key,
                Seconds(Plugin.Instance?.Configuration.DetailsCacheSeconds ?? 300),
                () => BuildRelatedJsonAsync(normalized, tmdbId, cancellationToken))).ConfigureAwait(false);
    }

    /// <summary>
    /// Searches Seerr.
    /// </summary>
    [HttpGet("search")]
    [Produces("application/json")]
    public async Task<ActionResult> Search(
        [FromQuery] string query,
        [FromQuery] int page = 1,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { error = "missing_query", message = "Search query is required." });
        }

        var key = string.Join(':', "search", query.Trim().ToLowerInvariant(), Math.Max(page, 1));
        return await BuildJsonResponseAsync(
            () => _cache.GetOrCreateAsync(
                key,
                Seconds(Plugin.Instance?.Configuration.SearchCacheSeconds ?? 60),
                () => _seerrClient.SearchAsync(query, page, cancellationToken))).ConfigureAwait(false);
    }

    /// <summary>
    /// Gets movie or TV details.
    /// </summary>
    [HttpGet("media/{mediaType}/{tmdbId:int}")]
    [Produces("application/json")]
    public async Task<ActionResult> GetMedia(
        [FromRoute] string mediaType,
        [FromRoute] int tmdbId,
        CancellationToken cancellationToken)
    {
        var normalized = mediaType.Trim().ToLowerInvariant();
        if (normalized is not ("movie" or "tv"))
        {
            return BadRequest(new { error = "invalid_media_type", message = "mediaType must be movie or tv." });
        }

        var key = string.Join(':', "media", normalized, tmdbId.ToString(CultureInfo.InvariantCulture));
        return await BuildJsonResponseAsync(
            () => _cache.GetOrCreateAsync(
                key,
                Seconds(Plugin.Instance?.Configuration.DetailsCacheSeconds ?? 300),
                () => _seerrClient.GetMediaAsync(normalized, tmdbId, cancellationToken))).ConfigureAwait(false);
    }

    /// <summary>
    /// Gets mapped Seerr user and quota for the current Jellyfin user.
    /// </summary>
    [HttpGet("me")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> GetMe(CancellationToken cancellationToken)
    {
        var jellyfinUserId = GetJellyfinUserId();
        if (jellyfinUserId == Guid.Empty)
        {
            return Unauthorized(new { mapped = false, error = "missing_jellyfin_user" });
        }

        var key = string.Join(':', "me", jellyfinUserId.ToString("N", CultureInfo.InvariantCulture));
        return await BuildJsonResponseAsync(
            () => _cache.GetOrCreateAsync(
                key,
                Seconds(Plugin.Instance?.Configuration.UserCacheSeconds ?? 60),
                () => BuildMeJsonAsync(jellyfinUserId, cancellationToken))).ConfigureAwait(false);
    }

    /// <summary>
    /// Creates a Seerr request as the mapped Jellyfin user.
    /// </summary>
    [HttpPost("request")]
    [Produces("application/json")]
    public async Task<ActionResult> CreateRequest([FromBody] SeerrDiscoverRequest request, CancellationToken cancellationToken)
    {
        var normalized = request.MediaType.Trim().ToLowerInvariant();
        if (normalized is not ("movie" or "tv") || request.MediaId <= 0)
        {
            return BadRequest(new { error = "invalid_request", message = "mediaType and mediaId are required." });
        }

        request.MediaType = normalized;
        var jellyfinUserId = GetJellyfinUserId();
        if (jellyfinUserId == Guid.Empty)
        {
            return Unauthorized(new { error = "missing_jellyfin_user" });
        }

        try
        {
            var mapped = await _seerrClient.GetMappedUserAsync(jellyfinUserId, cancellationToken).ConfigureAwait(false);
            if (!mapped.Found)
            {
                return Conflict(new
                {
                    error = "seerr_user_not_mapped",
                    message = "This Jellyfin user is not linked/imported in Seerr. Open Seerr once or run the Seerr/Jellyfin user import before requesting."
                });
            }

            var seerrUser = JsonSerializer.Deserialize<MappedSeerrUser>(mapped.Json, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (Plugin.Instance?.Configuration.RequireMappedUser == true && (seerrUser?.Id ?? 0) <= 0)
            {
                return Conflict(new { error = "seerr_user_not_mapped", message = "Seerr did not return a mapped user id." });
            }

            var result = await _seerrClient.CreateRequestAsync(request, seerrUser?.Id, cancellationToken).ConfigureAwait(false);
            _cache.InvalidateAfterRequest();
            return Content(result, "application/json");
        }
        catch (SeerrHttpException ex)
        {
            return BuildSeerrErrorResponse(ex);
        }
        catch (InvalidOperationException ex)
        {
            return BuildConfigurationErrorResponse(ex);
        }
    }

    private static TimeSpan Seconds(int seconds)
        => TimeSpan.FromSeconds(Math.Clamp(seconds, 5, 3600));

    private static IReadOnlyList<DiscoverRail> BuildDiscoverRails(PluginConfiguration config)
    {
        return BuildDiscoverRails(config, includeDisabled: false);
    }

    private static IReadOnlyList<DiscoverRail> BuildDiscoverRails(PluginConfiguration config, bool includeDisabled)
    {
        var catalog = BuildDiscoverRailCatalog(config).ToDictionary(rail => rail.Id, StringComparer.OrdinalIgnoreCase);
        return NormalizeRailPresentation(config.DiscoverRailPresentation, catalog.Keys)
            .Select(presentation =>
            {
                var rail = catalog[presentation.Id];
                return rail with
                {
                    Title = ResolveRailTitle(presentation.Title, rail.Title),
                    ArtworkLayout = presentation.ArtworkLayout
                };
            })
            .Where(rail => includeDisabled || IsFeedEnabled(config, rail.Feed, null))
            .ToList();
    }

    private static IReadOnlyList<DiscoverRail> BuildDiscoverRailCatalog(PluginConfiguration config)
    {
        var rails = DiscoverRailDefinitions
            .Select(rail => new DiscoverRail(rail.Id, rail.Title, rail.Feed, ArtworkLayoutVertical))
            .ToList();

        rails.AddRange(RequestRailDefinitions
            .Select(rail => new DiscoverRail(rail.Id, rail.Title, rail.Feed, ArtworkLayoutVertical)));

        rails.AddRange(NormalizeExtraRails(config.ExtraRails)
            .Select(static rail => new DiscoverRail(rail.Id, rail.Title, rail.Id, ArtworkLayoutVertical)));
        return rails;
    }

    private static IReadOnlyList<DetailRail> BuildDetailRails(PluginConfiguration config)
    {
        var catalog = DetailRailDefinitions.ToDictionary(rail => rail.Id, StringComparer.OrdinalIgnoreCase);
        return NormalizeRailPresentation(config.DetailRailPresentation, catalog.Keys)
            .Select(presentation =>
            {
                var rail = catalog[presentation.Id];
                return new DetailRail(rail.Id, ResolveRailTitle(presentation.Title, rail.Title), presentation.ArtworkLayout);
            })
            .ToList();
    }

    private static bool IsDetailRailEnabled(PluginConfiguration config, string id)
        => NormalizeToken(id) switch
        {
            "similar" => config.EnableDetailSimilar,
            "recommended" => config.EnableDetailRecommended,
            _ => false
        };

    private static bool IsFeedEnabled(PluginConfiguration? config, string feed, string? mediaType)
    {
        config ??= new PluginConfiguration();
        var normalizedFeed = NormalizeFeed(feed);
        return normalizedFeed switch
        {
            "trending" => IsLegacyTrendingEnabled(config, mediaType),
            "trending-movies" => IsTrendingMoviesEnabled(config),
            "trending-tv" => IsTrendingTvEnabled(config),
            "movies" => config.EnableMovies,
            "tv" => config.EnableTv,
            "upcoming" => config.EnableUpcoming,
            "upcoming-tv" => config.EnableUpcomingTv,
            "recently-requested" => config.EnableRecentlyRequested,
            "server-popular" => config.EnablePopularWithServer,
            _ => NormalizeExtraRails(config.ExtraRails).Any(rail => rail.Enabled && rail.Id.Equals(normalizedFeed, StringComparison.OrdinalIgnoreCase))
        };
    }

    private static bool IsLegacyTrendingEnabled(PluginConfiguration config, string? mediaType)
    {
        var normalizedMediaType = (mediaType ?? string.Empty).Trim().ToLowerInvariant();
        return normalizedMediaType switch
        {
            "movie" => IsTrendingMoviesEnabled(config),
            "tv" => IsTrendingTvEnabled(config),
            "" or "all" => IsTrendingMoviesEnabled(config) && IsTrendingTvEnabled(config),
            _ => false
        };
    }

    private static bool IsTrendingMoviesEnabled(PluginConfiguration config)
        => config.UseSplitTrendingRailSettings ? config.EnableTrendingMovies : config.EnableTrending && config.EnableTrendingMovies;

    private static bool IsTrendingTvEnabled(PluginConfiguration config)
        => config.UseSplitTrendingRailSettings ? config.EnableTrendingTv : config.EnableTrending && config.EnableTrendingTv;

    private async Task<string> BuildRequestRailJsonAsync(string feed, int page, CancellationToken cancellationToken)
    {
        var normalizedPage = Math.Max(page, 1);
        var take = feed == "server-popular" ? 80 : 40;
        var skip = feed == "server-popular" ? 0 : (normalizedPage - 1) * 20;
        var requestsJson = await _seerrClient.GetRequestsAsync(take, skip, "added", cancellationToken).ConfigureAwait(false);
        using var requestDocument = JsonDocument.Parse(requestsJson);
        var seeds = ExtractRequestSeeds(requestDocument.RootElement, feed == "server-popular");
        var results = new JsonArray();

        foreach (var seed in seeds.Take(20))
        {
            var detail = await TryBuildMediaNodeAsync(seed.MediaType, seed.TmdbId, cancellationToken).ConfigureAwait(false);
            if (detail is not null)
            {
                results.Add(detail);
            }
        }

        return BuildResultsEnvelope(normalizedPage, results);
    }

    private async Task<JsonObject?> TryBuildMediaNodeAsync(string mediaType, int tmdbId, CancellationToken cancellationToken)
    {
        try
        {
            var detailJson = await _seerrClient.GetMediaAsync(mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
            var node = JsonNode.Parse(detailJson) as JsonObject;
            if (node is null)
            {
                return null;
            }

            RemoveRequestUserData(node);
            return node;
        }
        catch (SeerrHttpException)
        {
            return null;
        }
    }

    private static IReadOnlyList<RequestRailSeed> ExtractRequestSeeds(JsonElement root, bool aggregate)
    {
        if (!root.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<RequestRailSeed>();
        }

        var seeds = new List<RequestRailSeed>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var groups = new Dictionary<string, RequestRailSeed>(StringComparer.OrdinalIgnoreCase);
        var position = 0;
        foreach (var request in results.EnumerateArray())
        {
            position++;
            if (!TryReadRequestMedia(request, out var mediaType, out var tmdbId))
            {
                continue;
            }

            var key = $"{mediaType}:{tmdbId.ToString(CultureInfo.InvariantCulture)}";
            if (aggregate)
            {
                groups[key] = groups.TryGetValue(key, out var existing)
                    ? existing with { Count = existing.Count + 1 }
                    : new RequestRailSeed(mediaType, tmdbId, 1, position);
                continue;
            }

            if (seen.Add(key))
            {
                seeds.Add(new RequestRailSeed(mediaType, tmdbId, 1, position));
            }
        }

        if (!aggregate)
        {
            return seeds;
        }

        return groups.Values
            .OrderByDescending(seed => seed.Count)
            .ThenBy(seed => seed.Position)
            .ToList();
    }

    private static bool TryReadRequestMedia(JsonElement request, out string mediaType, out int tmdbId)
    {
        mediaType = string.Empty;
        tmdbId = 0;
        if (!request.TryGetProperty("media", out var media) || media.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (media.TryGetProperty("mediaType", out var mediaTypeElement) && mediaTypeElement.ValueKind == JsonValueKind.String)
        {
            mediaType = mediaTypeElement.GetString() ?? string.Empty;
        }

        mediaType = NormalizeMediaType(mediaType) ?? string.Empty;
        if (string.IsNullOrWhiteSpace(mediaType))
        {
            return false;
        }

        if (media.TryGetProperty("tmdbId", out var tmdbIdElement) && tmdbIdElement.TryGetInt32(out var parsedTmdbId))
        {
            tmdbId = parsedTmdbId;
        }

        return tmdbId > 0;
    }

    private async Task<string> BuildRelatedJsonAsync(string mediaType, int tmdbId, CancellationToken cancellationToken)
    {
        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        var rails = new JsonArray();

        foreach (var rail in BuildDetailRails(config))
        {
            if (!IsDetailRailEnabled(config, rail.Id))
            {
                continue;
            }

            var related = await BuildRelatedRailAsync(mediaType, tmdbId, rail.Id, rail.Title, rail.ArtworkLayout, cancellationToken).ConfigureAwait(false);
            if (related is not null)
            {
                rails.Add(related);
            }
        }

        return JsonSerializer.Serialize(new JsonObject { ["rails"] = rails });
    }

    private async Task<JsonObject?> BuildRelatedRailAsync(string mediaType, int tmdbId, string relation, string title, string artworkLayout, CancellationToken cancellationToken)
    {
        try
        {
            var json = await _seerrClient.GetRelatedAsync(mediaType, tmdbId, relation, 1, cancellationToken).ConfigureAwait(false);
            var root = JsonNode.Parse(json) as JsonObject;
            var results = root?["results"] as JsonArray;
            if (results is null || results.Count == 0)
            {
                return null;
            }

            RemoveRequestUserData(results);
            return new JsonObject
            {
                ["id"] = relation,
                ["title"] = title,
                ["artworkLayout"] = artworkLayout,
                ["results"] = results.DeepClone()
            };
        }
        catch (SeerrHttpException)
        {
            return null;
        }
    }

    private static string BuildResultsEnvelope(int page, JsonArray results)
        => JsonSerializer.Serialize(new JsonObject
        {
            ["page"] = Math.Max(page, 1),
            ["totalPages"] = 1,
            ["totalResults"] = results.Count,
            ["results"] = results
        });

    private static string BuildSingleResultJson(string json)
    {
        var node = JsonNode.Parse(json);
        return JsonSerializer.Serialize(new JsonObject
        {
            ["results"] = new JsonArray(node)
        });
    }

    private static void RemoveRequestUserData(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                obj.Remove("requestedBy");
                obj.Remove("modifiedBy");
                foreach (var child in obj.Select(static pair => pair.Value).ToList())
                {
                    RemoveRequestUserData(child);
                }

                break;
            case JsonArray array:
                foreach (var child in array)
                {
                    RemoveRequestUserData(child);
                }

                break;
        }
    }

    private Guid GetJellyfinUserId()
    {
        var value = User.Claims.FirstOrDefault(claim => claim.Type.Equals(JellyfinUserIdClaim, StringComparison.OrdinalIgnoreCase))?.Value;
        return Guid.TryParse(value, out var userId) ? userId : Guid.Empty;
    }

    private async Task<string> BuildMeJsonAsync(Guid jellyfinUserId, CancellationToken cancellationToken)
    {
        var enableNativeSearchIntegration = Plugin.Instance?.Configuration.EnableNativeSearchIntegration != false;
        var mapped = await _seerrClient.GetMappedUserAsync(jellyfinUserId, cancellationToken).ConfigureAwait(false);
        var seerrPublicUrl = NormalizedSeerrPublicUrl();
        if (!mapped.Found)
        {
            return JsonSerializer.Serialize(new
            {
                mapped = false,
                jellyfinUserId = jellyfinUserId.ToString("N", CultureInfo.InvariantCulture),
                seerrPublicUrl,
                enableNativeSearchIntegration
            });
        }

        using var userDoc = JsonDocument.Parse(mapped.Json);
        var user = userDoc.RootElement.Clone();
        var seerrUserId = user.TryGetProperty("id", out var idElement) && idElement.TryGetInt32(out var id) ? id : 0;
        JsonElement? quota = null;
        if (seerrUserId > 0)
        {
            using var quotaDoc = JsonDocument.Parse(await _seerrClient.GetQuotaAsync(seerrUserId, cancellationToken).ConfigureAwait(false));
            quota = quotaDoc.RootElement.Clone();
        }

        return JsonSerializer.Serialize(new
        {
            mapped = true,
            jellyfinUserId = jellyfinUserId.ToString("N", CultureInfo.InvariantCulture),
            seerrPublicUrl,
            enableNativeSearchIntegration,
            user,
            quota
        });
    }

    private static string NormalizedSeerrPublicUrl()
        => (Plugin.Instance?.Configuration.SeerrPublicUrl ?? string.Empty).Trim().TrimEnd('/');

    private async Task<ActionResult> BuildJsonResponseAsync(Func<Task<string>> getJson)
    {
        try
        {
            var json = await getJson().ConfigureAwait(false);
            return Content(json, "application/json");
        }
        catch (SeerrHttpException ex)
        {
            return BuildSeerrErrorResponse(ex);
        }
        catch (InvalidOperationException ex)
        {
            return BuildConfigurationErrorResponse(ex);
        }
    }

    private static SeerrDiscoverConfigurationDto ToConfigurationDto(PluginConfiguration config)
    {
        var dto = new SeerrDiscoverConfigurationDto
        {
            SeerrBaseUrl = config.SeerrBaseUrl,
            SeerrPublicUrl = config.SeerrPublicUrl,
            SeerrApiKeyConfigured = !string.IsNullOrWhiteSpace(config.SeerrApiKey),
            Language = config.Language,
            DiscoverCacheSeconds = config.DiscoverCacheSeconds,
            DetailsCacheSeconds = config.DetailsCacheSeconds,
            SearchCacheSeconds = config.SearchCacheSeconds,
            UserCacheSeconds = config.UserCacheSeconds,
            RequireMappedUser = config.RequireMappedUser,
            EnableNativeSearchIntegration = config.EnableNativeSearchIntegration,
            DefaultRequest4K = config.DefaultRequest4K,
            EnableTrending = IsTrendingMoviesEnabled(config) || IsTrendingTvEnabled(config),
            EnableTrendingMovies = IsTrendingMoviesEnabled(config),
            EnableTrendingTv = IsTrendingTvEnabled(config),
            EnableMovies = config.EnableMovies,
            EnableTv = config.EnableTv,
            EnableUpcoming = config.EnableUpcoming,
            EnableUpcomingTv = config.EnableUpcomingTv,
            EnableRecentlyRequested = config.EnableRecentlyRequested,
            EnablePopularWithServer = config.EnablePopularWithServer,
            EnableDetailSimilar = config.EnableDetailSimilar,
            EnableDetailRecommended = config.EnableDetailRecommended
        };

        dto.ExtraRails.AddRange(NormalizeExtraRails(config.ExtraRails).Select(ToExtraRailDto));
        dto.DiscoverRailPresentation.AddRange(NormalizeRailPresentation(
            config.DiscoverRailPresentation,
            BuildDiscoverRailCatalog(config).Select(rail => rail.Id)).Select(ToRailPresentationDto));
        dto.DetailRailPresentation.AddRange(NormalizeRailPresentation(
            config.DetailRailPresentation,
            DetailRailDefinitions.Select(rail => rail.Id)).Select(ToRailPresentationDto));
        return dto;
    }

    private static void ApplyConfigurationUpdate(PluginConfiguration config, SeerrDiscoverConfigurationUpdate update)
    {
        config.SeerrBaseUrl = (update.SeerrBaseUrl ?? string.Empty).Trim();
        config.SeerrPublicUrl = (update.SeerrPublicUrl ?? string.Empty).Trim().TrimEnd('/');
        config.Language = string.IsNullOrWhiteSpace(update.Language) ? "en" : update.Language.Trim();
        config.DiscoverCacheSeconds = ClampSeconds(update.DiscoverCacheSeconds, 600);
        config.DetailsCacheSeconds = ClampSeconds(update.DetailsCacheSeconds, 300);
        config.SearchCacheSeconds = ClampSeconds(update.SearchCacheSeconds, 60);
        config.UserCacheSeconds = ClampSeconds(update.UserCacheSeconds, 60);
        config.RequireMappedUser = update.RequireMappedUser;
        config.EnableNativeSearchIntegration = update.EnableNativeSearchIntegration;
        config.DefaultRequest4K = update.DefaultRequest4K;
        config.UseSplitTrendingRailSettings = true;
        config.EnableTrendingMovies = update.EnableTrendingMovies ?? update.EnableTrending;
        config.EnableTrendingTv = update.EnableTrendingTv ?? update.EnableTrending;
        config.EnableTrending = config.EnableTrendingMovies || config.EnableTrendingTv;
        config.EnableMovies = update.EnableMovies;
        config.EnableTv = update.EnableTv;
        config.EnableUpcoming = update.EnableUpcoming;
        config.EnableUpcomingTv = update.EnableUpcomingTv;
        config.EnableRecentlyRequested = update.EnableRecentlyRequested;
        config.EnablePopularWithServer = update.EnablePopularWithServer;
        config.EnableDetailSimilar = update.EnableDetailSimilar;
        config.EnableDetailRecommended = update.EnableDetailRecommended;
        config.ExtraRails = NormalizeExtraRails(update.ExtraRails?.Select(FromExtraRailDto)).ToList();
        if (update.DiscoverRailPresentation is not null)
        {
            config.DiscoverRailPresentation = NormalizeRailPresentation(
                update.DiscoverRailPresentation.Select(FromRailPresentationDto),
                BuildDiscoverRailCatalog(config).Select(rail => rail.Id)).ToList();
        }

        if (update.DetailRailPresentation is not null)
        {
            config.DetailRailPresentation = NormalizeRailPresentation(
                update.DetailRailPresentation.Select(FromRailPresentationDto),
                DetailRailDefinitions.Select(rail => rail.Id)).ToList();
        }

        if (update.ClearSeerrApiKey)
        {
            config.SeerrApiKey = string.Empty;
        }
        else if (!string.IsNullOrWhiteSpace(update.SeerrApiKey))
        {
            config.SeerrApiKey = update.SeerrApiKey.Trim();
        }
    }

    private static SeerrExtraRailDto ToExtraRailDto(SeerrExtraRail rail)
        => new()
        {
            Id = rail.Id,
            Kind = rail.Kind,
            MediaType = rail.MediaType,
            Value = rail.Value,
            Title = rail.Title,
            Enabled = rail.Enabled
        };

    private static SeerrExtraRail FromExtraRailDto(SeerrExtraRailDto rail)
        => new()
        {
            Id = rail.Id,
            Kind = rail.Kind,
            MediaType = rail.MediaType,
            Value = rail.Value,
            Title = rail.Title,
            Enabled = rail.Enabled
        };

    private static SeerrRailPresentationDto ToRailPresentationDto(SeerrRailPresentation presentation)
        => new()
        {
            Id = presentation.Id,
            ArtworkLayout = presentation.ArtworkLayout,
            Title = presentation.Title
        };

    private static SeerrRailPresentation FromRailPresentationDto(SeerrRailPresentationDto presentation)
        => new()
        {
            Id = presentation.Id,
            ArtworkLayout = presentation.ArtworkLayout,
            Title = presentation.Title
        };

    private static IReadOnlyList<SeerrRailPresentation> NormalizeRailPresentation(IEnumerable<SeerrRailPresentation>? presentation, IEnumerable<string> knownIds)
    {
        var orderedIds = knownIds
            .Select(id => NormalizeToken(id))
            .Where(static id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var known = orderedIds.ToDictionary(id => id, StringComparer.OrdinalIgnoreCase);
        var normalized = new List<SeerrRailPresentation>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (presentation is not null)
        {
            foreach (var item in presentation)
            {
                var id = NormalizeToken(item.Id);
                if (!known.TryGetValue(id, out var canonicalId) || !seen.Add(canonicalId))
                {
                    continue;
                }

                normalized.Add(new SeerrRailPresentation
                {
                    Id = canonicalId,
                    ArtworkLayout = NormalizeArtworkLayout(item.ArtworkLayout),
                    Title = NormalizeRailTitle(item.Title)
                });
            }
        }

        foreach (var id in orderedIds)
        {
            if (!seen.Add(id))
            {
                continue;
            }

            normalized.Add(new SeerrRailPresentation
            {
                Id = id,
                ArtworkLayout = ArtworkLayoutVertical,
                Title = string.Empty
            });
        }

        return normalized;
    }

    private static string NormalizeArtworkLayout(string? value)
        => NormalizeToken(value ?? string.Empty) == ArtworkLayoutHorizontal ? ArtworkLayoutHorizontal : ArtworkLayoutVertical;

    private static string ResolveRailTitle(string? customTitle, string defaultTitle)
    {
        var normalizedTitle = NormalizeRailTitle(customTitle);
        return string.IsNullOrWhiteSpace(normalizedTitle) ? defaultTitle : normalizedTitle;
    }

    private static string NormalizeRailTitle(string? value)
    {
        var title = (value ?? string.Empty).Trim();
        return title.Length > 96 ? title[..96] : title;
    }

    private static IReadOnlyList<SeerrExtraRail> NormalizeExtraRails(IEnumerable<SeerrExtraRail>? rails)
    {
        if (rails is null)
        {
            return Array.Empty<SeerrExtraRail>();
        }

        var normalized = new List<SeerrExtraRail>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var rail in rails)
        {
            var kind = NormalizeToken(rail.Kind);
            var mediaType = NormalizeMediaType(rail.MediaType);
            var value = NormalizeRailValue(kind, rail.Value);
            if (!IsValidExtraRail(kind, mediaType, value))
            {
                continue;
            }

            var id = BuildExtraRailId(kind, mediaType!, value);
            if (!seen.Add(id))
            {
                continue;
            }

            normalized.Add(new SeerrExtraRail
            {
                Id = id,
                Kind = kind,
                MediaType = mediaType!,
                Value = value,
                Title = string.IsNullOrWhiteSpace(rail.Title) ? DefaultExtraRailTitle(kind, mediaType!, value) : rail.Title.Trim(),
                Enabled = rail.Enabled
            });

            if (normalized.Count >= 30)
            {
                break;
            }
        }

        return normalized;
    }

    private static bool IsValidExtraRail(string kind, string? mediaType, string value)
    {
        if (string.IsNullOrWhiteSpace(mediaType) || string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return kind switch
        {
            "genre" => IsPositiveInt(value) && mediaType is "movie" or "tv",
            "studio" => IsPositiveInt(value) && mediaType == "movie",
            "network" => IsPositiveInt(value) && mediaType == "tv",
            "language" => mediaType is "movie" or "tv",
            "keyword" => IsPositiveInt(value) && mediaType is "movie" or "tv",
            _ => false
        };
    }

    private static bool IsPositiveInt(string value)
        => int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) && parsed > 0;

    private static string BuildExtraRailId(string kind, string mediaType, string value)
        => $"{kind}-{mediaType}-{value}";

    private static string DefaultExtraRailTitle(string kind, string mediaType, string value)
    {
        var mediaLabel = mediaType == "tv" ? "TV" : "Movies";
        var kindLabel = CultureInfo.InvariantCulture.TextInfo.ToTitleCase(kind);
        return $"{kindLabel} {value} {mediaLabel}";
    }

    private static string NormalizeFeed(string value)
        => NormalizeToken(value);

    private static string NormalizeToken(string value)
        => (value ?? string.Empty).Trim().ToLowerInvariant();

    private static string? NormalizeMediaType(string value)
    {
        var normalized = NormalizeToken(value);
        return normalized is "movie" or "tv" ? normalized : null;
    }

    private static string NormalizeRailValue(string kind, string value)
    {
        var trimmed = (value ?? string.Empty).Trim().ToLowerInvariant();
        if (kind == "language")
        {
            return new string(trimmed.Where(static c => char.IsLetterOrDigit(c) || c == '-').ToArray());
        }

        return new string(trimmed.Where(char.IsDigit).ToArray());
    }

    private static int ClampSeconds(int value, int fallback)
        => Math.Clamp(value <= 0 ? fallback : value, 5, 3600);

    private static ObjectResult BuildConfigurationErrorResponse(InvalidOperationException ex)
        => new(new
        {
            error = "seerr_plugin_not_configured",
            message = SafeConfigurationMessage(ex)
        })
        {
            StatusCode = StatusCodes.Status503ServiceUnavailable
        };

    private static string SafeConfigurationMessage(InvalidOperationException ex)
    {
        if (ex.Message.Contains("API key", StringComparison.OrdinalIgnoreCase))
        {
            return "Seerr API key is not configured. Update the Seerr Discover plugin settings in the Jellyfin dashboard.";
        }

        if (ex.Message.Contains("BaseUrl", StringComparison.OrdinalIgnoreCase))
        {
            return "Seerr base URL is invalid. Update the Seerr Discover plugin settings in the Jellyfin dashboard.";
        }

        return "Seerr Discover is not configured correctly. Update the plugin settings in the Jellyfin dashboard.";
    }

    private static ObjectResult BuildSeerrErrorResponse(SeerrHttpException ex)
    {
        var upstreamStatus = (int)ex.StatusCode;
        return new ObjectResult(new
        {
            error = "seerr_request_failed",
            upstreamStatus,
            message = ExtractSeerrMessage(ex.ResponseBody) ?? "Seerr returned an upstream error."
        })
        {
            StatusCode = upstreamStatus
        };
    }

    private static string? ExtractSeerrMessage(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            if (document.RootElement.TryGetProperty("message", out var message))
            {
                return JsonElementToMessage(message);
            }

            if (document.RootElement.TryGetProperty("error", out var error))
            {
                return JsonElementToMessage(error);
            }
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static string? JsonElementToMessage(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Array => string.Join("; ", element.EnumerateArray().Select(JsonElementToMessage).Where(static value => !string.IsNullOrWhiteSpace(value))),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _ => null
        };
    }
}
