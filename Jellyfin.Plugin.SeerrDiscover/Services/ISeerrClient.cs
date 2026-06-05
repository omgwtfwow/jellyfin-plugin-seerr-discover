using System;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.SeerrDiscover.Models;

namespace Jellyfin.Plugin.SeerrDiscover.Services;

/// <summary>
/// Thin Seerr API client.
/// </summary>
public interface ISeerrClient
{
    /// <summary>
    /// Pings Seerr public settings.
    /// </summary>
    Task<string> GetHealthAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Gets a discover feed.
    /// </summary>
    Task<string> GetDiscoverAsync(string feed, int page, string? mediaType, CancellationToken cancellationToken);

    /// <summary>
    /// Gets recent Seerr requests.
    /// </summary>
    Task<string> GetRequestsAsync(int take, int skip, string sort, CancellationToken cancellationToken);

    /// <summary>
    /// Searches Seerr/TMDB.
    /// </summary>
    Task<string> SearchAsync(string query, int page, CancellationToken cancellationToken);

    /// <summary>
    /// Searches TMDB companies through Seerr.
    /// </summary>
    Task<string> SearchCompaniesAsync(string query, int page, CancellationToken cancellationToken);

    /// <summary>
    /// Searches TMDB keywords through Seerr.
    /// </summary>
    Task<string> SearchKeywordsAsync(string query, int page, CancellationToken cancellationToken);

    /// <summary>
    /// Gets TMDB genres through Seerr.
    /// </summary>
    Task<string> GetGenresAsync(string mediaType, CancellationToken cancellationToken);

    /// <summary>
    /// Gets TMDB languages through Seerr.
    /// </summary>
    Task<string> GetLanguagesAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Gets movie studio details through Seerr.
    /// </summary>
    Task<string> GetStudioAsync(int studioId, CancellationToken cancellationToken);

    /// <summary>
    /// Gets TV network details through Seerr.
    /// </summary>
    Task<string> GetNetworkAsync(int networkId, CancellationToken cancellationToken);

    /// <summary>
    /// Gets similar or recommended media for a detail modal.
    /// </summary>
    Task<string> GetRelatedAsync(string mediaType, int tmdbId, string relation, int page, CancellationToken cancellationToken);

    /// <summary>
    /// Gets movie or TV details.
    /// </summary>
    Task<string> GetMediaAsync(string mediaType, int tmdbId, CancellationToken cancellationToken);

    /// <summary>
    /// Gets the Seerr user mapped to a Jellyfin user id.
    /// </summary>
    Task<(bool Found, string Json)> GetMappedUserAsync(Guid jellyfinUserId, CancellationToken cancellationToken);

    /// <summary>
    /// Gets Seerr quota data for a user.
    /// </summary>
    Task<string> GetQuotaAsync(int seerrUserId, CancellationToken cancellationToken);

    /// <summary>
    /// Creates a Seerr media request.
    /// </summary>
    Task<string> CreateRequestAsync(SeerrDiscoverRequest request, int? seerrUserId, CancellationToken cancellationToken);
}
