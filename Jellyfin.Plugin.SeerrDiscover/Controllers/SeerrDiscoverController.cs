using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
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
    private static readonly (string Id, string Title, string Feed)[] DiscoverRailDefinitions =
    {
        ("trending-movies", "Trending Movies", "trending-movies"),
        ("trending-tv", "Trending TV", "trending-tv"),
        ("movies", "Popular Movies", "movies"),
        ("tv", "Popular TV", "tv"),
        ("upcoming", "Upcoming Movies", "upcoming")
    };

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
    {
        var resourceName = $"{typeof(Plugin).Namespace}.Web.discover.js";
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound("Embedded Discover asset is missing.");
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
    [Authorize(Policy = "RequiresElevation")]
    [Produces("application/json")]
    public ActionResult GetConfiguration()
        => new JsonResult(ToConfigurationDto(Plugin.Instance?.Configuration ?? new PluginConfiguration()));

    /// <summary>
    /// Updates plugin configuration from the admin page.
    /// </summary>
    [HttpPost("config")]
    [Authorize(Policy = "RequiresElevation")]
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
            discoverRails = DiscoverRailDefinitions
                .Where(rail => IsFeedEnabled(config, rail.Feed, null))
                .Select(rail => new { id = rail.Id, title = rail.Title, feed = rail.Feed }),
            seerrPublicUrl = NormalizedSeerrPublicUrl()
        });
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
        return await BuildJsonResponseAsync(
            () => _cache.GetOrCreateAsync(
                key,
                Seconds(Plugin.Instance?.Configuration.DiscoverCacheSeconds ?? 600),
                () => _seerrClient.GetDiscoverAsync(feed, page, mediaType, cancellationToken))).ConfigureAwait(false);
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

    private static bool IsFeedEnabled(PluginConfiguration? config, string feed, string? mediaType)
    {
        config ??= new PluginConfiguration();
        return feed.Trim().ToLowerInvariant() switch
        {
            "trending" => IsLegacyTrendingEnabled(config, mediaType),
            "trending-movies" => IsTrendingMoviesEnabled(config),
            "trending-tv" => IsTrendingTvEnabled(config),
            "movies" => config.EnableMovies,
            "tv" => config.EnableTv,
            "upcoming" => config.EnableUpcoming,
            _ => false
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
        => new()
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
            EnableUpcoming = config.EnableUpcoming
        };

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

        if (update.ClearSeerrApiKey)
        {
            config.SeerrApiKey = string.Empty;
        }
        else if (!string.IsNullOrWhiteSpace(update.SeerrApiKey))
        {
            config.SeerrApiKey = update.SeerrApiKey.Trim();
        }
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
