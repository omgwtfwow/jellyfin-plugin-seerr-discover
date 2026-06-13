using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.SeerrDiscover.Configuration;
using Jellyfin.Plugin.SeerrDiscover.Models;
using Microsoft.AspNetCore.WebUtilities;

namespace Jellyfin.Plugin.SeerrDiscover.Services;

/// <summary>
/// HTTP client for Seerr.
/// </summary>
public sealed class SeerrClient : ISeerrClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;

    /// <summary>
    /// Initializes a new instance of the <see cref="SeerrClient"/> class.
    /// </summary>
    /// <param name="httpClient">HTTP client.</param>
    public SeerrClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
    }

    /// <inheritdoc />
    public Task<string> GetHealthAsync(CancellationToken cancellationToken)
        => SendAsync(HttpMethod.Get, "/api/v1/settings/public", null, false, cancellationToken);

    /// <inheritdoc />
    public Task<string> GetDiscoverAsync(string feed, int page, string? mediaType, CancellationToken cancellationToken)
        => SendAsync(HttpMethod.Get, BuildDiscoverPath(feed, page, mediaType, Config.Language), null, true, cancellationToken);

    private static string BuildDiscoverPath(string feed, int page, string? mediaType, string language)
    {
        var normalizedFeed = feed.Trim().ToLowerInvariant();
        var path = normalizedFeed switch
        {
            "trending-movies" => "/api/v1/discover/trending",
            "trending-tv" => "/api/v1/discover/trending",
            "movies" => "/api/v1/discover/movies",
            "tv" => "/api/v1/discover/tv",
            "upcoming" => "/api/v1/discover/movies/upcoming",
            "upcoming-tv" => "/api/v1/discover/tv/upcoming",
            _ => BuildExtraDiscoverPath(normalizedFeed) ?? throw new ArgumentException("Unsupported discover feed.", nameof(feed))
        };

        var query = new Dictionary<string, string?>
        {
            ["page"] = Math.Max(page, 1).ToString(CultureInfo.InvariantCulture),
            ["language"] = language
        };

        if (normalizedFeed is "trending-movies" or "trending-tv")
        {
            query["mediaType"] = normalizedFeed switch
            {
                "trending-movies" => "movie",
                _ => "tv"
            };
            query["timeWindow"] = "day";
        }
        else if (normalizedFeed is "movies" or "tv")
        {
            query["sortBy"] = "popularity.desc";
        }

        return QueryHelpers.AddQueryString(path, query);
    }

    private static string? BuildExtraDiscoverPath(string normalizedFeed)
    {
        var parts = normalizedFeed.Split('-', 3, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 3)
        {
            return null;
        }

        var kind = parts[0];
        var mediaType = parts[1];
        var value = Uri.EscapeDataString(parts[2]);
        return (kind, mediaType) switch
        {
            ("genre", "movie") => $"/api/v1/discover/movies/genre/{value}",
            ("genre", "tv") => $"/api/v1/discover/tv/genre/{value}",
            ("studio", "movie") => $"/api/v1/discover/movies/studio/{value}",
            ("network", "tv") => $"/api/v1/discover/tv/network/{value}",
            ("language", "movie") => $"/api/v1/discover/movies/language/{value}",
            ("language", "tv") => $"/api/v1/discover/tv/language/{value}",
            ("keyword", "movie") => $"/api/v1/discover/keyword/{value}/movies",
            ("keyword", "tv") => QueryHelpers.AddQueryString("/api/v1/discover/tv", new Dictionary<string, string?>
            {
                ["keywords"] = parts[2],
                ["sortBy"] = "popularity.desc"
            }),
            _ => null
        };
    }

    /// <inheritdoc />
    public Task<string> GetRequestsAsync(int take, int skip, string sort, CancellationToken cancellationToken)
    {
        var path = QueryHelpers.AddQueryString(
            "/api/v1/request",
            new Dictionary<string, string?>
            {
                ["take"] = Math.Clamp(take, 1, 100).ToString(CultureInfo.InvariantCulture),
                ["skip"] = Math.Max(skip, 0).ToString(CultureInfo.InvariantCulture),
                ["sort"] = string.IsNullOrWhiteSpace(sort) ? "added" : sort
            });
        return SendAsync(HttpMethod.Get, path, null, true, cancellationToken);
    }

    /// <inheritdoc />
    public Task<string> SearchAsync(string query, int page, CancellationToken cancellationToken)
    {
        var path = QueryHelpers.AddQueryString(
            "/api/v1/search",
            new Dictionary<string, string?>
            {
                ["query"] = query,
                ["page"] = Math.Max(page, 1).ToString(CultureInfo.InvariantCulture),
                ["language"] = Config.Language
            });
        return SendAsync(HttpMethod.Get, path, null, true, cancellationToken);
    }

    /// <inheritdoc />
    public Task<string> SearchCompaniesAsync(string query, int page, CancellationToken cancellationToken)
    {
        var path = QueryHelpers.AddQueryString(
            "/api/v1/search/company",
            new Dictionary<string, string?>
            {
                ["query"] = query,
                ["page"] = Math.Max(page, 1).ToString(CultureInfo.InvariantCulture)
            });
        return SendAsync(HttpMethod.Get, path, null, true, cancellationToken);
    }

    /// <inheritdoc />
    public Task<string> SearchKeywordsAsync(string query, int page, CancellationToken cancellationToken)
    {
        var path = QueryHelpers.AddQueryString(
            "/api/v1/search/keyword",
            new Dictionary<string, string?>
            {
                ["query"] = query,
                ["page"] = Math.Max(page, 1).ToString(CultureInfo.InvariantCulture)
            });
        return SendAsync(HttpMethod.Get, path, null, true, cancellationToken);
    }

    /// <inheritdoc />
    public Task<string> GetGenresAsync(string mediaType, CancellationToken cancellationToken)
    {
        var normalized = mediaType.Trim().ToLowerInvariant();
        var path = normalized switch
        {
            "movie" => "/api/v1/genres/movie",
            "tv" => "/api/v1/genres/tv",
            _ => throw new ArgumentException("mediaType must be movie or tv.", nameof(mediaType))
        };

        path = QueryHelpers.AddQueryString(path, "language", Config.Language);
        return SendAsync(HttpMethod.Get, path, null, true, cancellationToken);
    }

    /// <inheritdoc />
    public Task<string> GetLanguagesAsync(CancellationToken cancellationToken)
        => SendAsync(HttpMethod.Get, "/api/v1/languages", null, true, cancellationToken);

    /// <inheritdoc />
    public Task<string> GetStudioAsync(int studioId, CancellationToken cancellationToken)
        => SendAsync(HttpMethod.Get, $"/api/v1/studio/{studioId.ToString(CultureInfo.InvariantCulture)}", null, true, cancellationToken);

    /// <inheritdoc />
    public Task<string> GetNetworkAsync(int networkId, CancellationToken cancellationToken)
        => SendAsync(HttpMethod.Get, $"/api/v1/network/{networkId.ToString(CultureInfo.InvariantCulture)}", null, true, cancellationToken);

    /// <inheritdoc />
    public Task<string> GetMediaAsync(string mediaType, int tmdbId, CancellationToken cancellationToken)
    {
        var normalized = mediaType.Trim().ToLowerInvariant();
        var path = normalized switch
        {
            "movie" => $"/api/v1/movie/{tmdbId.ToString(CultureInfo.InvariantCulture)}",
            "tv" => $"/api/v1/tv/{tmdbId.ToString(CultureInfo.InvariantCulture)}",
            _ => throw new ArgumentException("mediaType must be movie or tv.", nameof(mediaType))
        };

        path = QueryHelpers.AddQueryString(path, "language", Config.Language);
        return SendAsync(HttpMethod.Get, path, null, true, cancellationToken);
    }

    /// <inheritdoc />
    public Task<string> GetRelatedAsync(string mediaType, int tmdbId, string relation, int page, CancellationToken cancellationToken)
    {
        var normalized = mediaType.Trim().ToLowerInvariant();
        var normalizedRelation = relation.Trim().ToLowerInvariant();
        var id = tmdbId.ToString(CultureInfo.InvariantCulture);
        var path = (normalized, normalizedRelation) switch
        {
            ("movie", "recommended") => $"/api/v1/movie/{id}/recommendations",
            ("movie", "similar") => $"/api/v1/movie/{id}/similar",
            ("tv", "recommended") => $"/api/v1/tv/{id}/recommendations",
            ("tv", "similar") => $"/api/v1/tv/{id}/similar",
            _ => throw new ArgumentException("Unsupported related feed.", nameof(relation))
        };

        path = QueryHelpers.AddQueryString(
            path,
            new Dictionary<string, string?>
            {
                ["page"] = Math.Max(page, 1).ToString(CultureInfo.InvariantCulture),
                ["language"] = Config.Language
            });
        return SendAsync(HttpMethod.Get, path, null, true, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<(bool Found, string Json)> GetMappedUserAsync(Guid jellyfinUserId, CancellationToken cancellationToken)
    {
        try
        {
            var json = await SendAsync(
                HttpMethod.Get,
                $"/api/v1/user/jellyfin/{jellyfinUserId:N}",
                null,
                true,
                cancellationToken).ConfigureAwait(false);
            return (true, json);
        }
        catch (SeerrHttpException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return (false, "{}");
        }
    }

    /// <inheritdoc />
    public Task<string> GetQuotaAsync(int seerrUserId, CancellationToken cancellationToken)
        => SendAsync(HttpMethod.Get, $"/api/v1/user/{seerrUserId.ToString(CultureInfo.InvariantCulture)}/quota", null, true, cancellationToken);

    /// <inheritdoc />
    public Task<string> CreateRequestAsync(SeerrDiscoverRequest request, int? seerrUserId, CancellationToken cancellationToken)
    {
        var payload = BuildRequestPayload(request, seerrUserId);

        return SendAsync(HttpMethod.Post, "/api/v1/request", payload, true, cancellationToken);
    }

    private static PluginConfiguration Config => Plugin.Instance?.Configuration ?? new PluginConfiguration();

    private static Dictionary<string, object> BuildRequestPayload(SeerrDiscoverRequest request, int? seerrUserId)
    {
        var payload = new Dictionary<string, object>
        {
            ["mediaType"] = request.MediaType,
            ["mediaId"] = request.MediaId,
            ["is4k"] = request.Is4K ?? false
        };

        if (request.TvdbId.HasValue)
        {
            payload["tvdbId"] = request.TvdbId.Value;
        }

        if (request.MediaType.Equals("tv", StringComparison.OrdinalIgnoreCase))
        {
            payload["seasons"] = request.Seasons ?? "all";
        }
        else if (request.Seasons is not null)
        {
            payload["seasons"] = request.Seasons;
        }

        if (request.ServerId.HasValue)
        {
            payload["serverId"] = request.ServerId.Value;
        }

        if (request.ProfileId.HasValue)
        {
            payload["profileId"] = request.ProfileId.Value;
        }

        if (!string.IsNullOrWhiteSpace(request.RootFolder))
        {
            payload["rootFolder"] = request.RootFolder;
        }

        if (request.LanguageProfileId.HasValue)
        {
            payload["languageProfileId"] = request.LanguageProfileId.Value;
        }

        if (seerrUserId.HasValue)
        {
            payload["userId"] = seerrUserId.Value;
        }

        return payload;
    }

    private static Uri BaseUri
    {
        get
        {
            if (!Uri.TryCreate(Config.SeerrBaseUrl.TrimEnd('/'), UriKind.Absolute, out var uri))
            {
                throw new InvalidOperationException("SeerrBaseUrl must be an absolute URL.");
            }

            return uri;
        }
    }

    private async Task<string> SendAsync(HttpMethod method, string pathAndQuery, object? payload, bool requiresApiKey, CancellationToken cancellationToken)
    {
        if (requiresApiKey && string.IsNullOrWhiteSpace(Config.SeerrApiKey))
        {
            throw new InvalidOperationException("Seerr API key is not configured.");
        }

        using var request = new HttpRequestMessage(method, new Uri(BaseUri, pathAndQuery));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (requiresApiKey)
        {
            request.Headers.TryAddWithoutValidation("X-Api-Key", Config.SeerrApiKey);
        }

        if (payload is not null)
        {
            request.Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");
        }

        using var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var content = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new SeerrHttpException(response.StatusCode, content);
        }

        return content;
    }
}

/// <summary>
/// Seerr HTTP failure.
/// </summary>
public sealed class SeerrHttpException : Exception
{
    /// <summary>
    /// Initializes a new instance of the <see cref="SeerrHttpException"/> class.
    /// </summary>
    /// <param name="statusCode">HTTP status code.</param>
    /// <param name="responseBody">Response body.</param>
    public SeerrHttpException(HttpStatusCode statusCode, string responseBody)
        : base($"Seerr returned HTTP {(int)statusCode}.")
    {
        StatusCode = statusCode;
        ResponseBody = responseBody;
    }

    /// <summary>
    /// Gets the HTTP status code.
    /// </summary>
    public HttpStatusCode StatusCode { get; }

    /// <summary>
    /// Gets the response body.
    /// </summary>
    public string ResponseBody { get; }
}
