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
    /// Searches Seerr/TMDB.
    /// </summary>
    Task<string> SearchAsync(string query, int page, CancellationToken cancellationToken);

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
