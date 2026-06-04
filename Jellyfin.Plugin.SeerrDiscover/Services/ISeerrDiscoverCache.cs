using System;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.SeerrDiscover.Services;

/// <summary>
/// Cache helper for proxied Seerr responses.
/// </summary>
public interface ISeerrDiscoverCache
{
    /// <summary>
    /// Gets or creates a cached string value.
    /// </summary>
    /// <param name="key">Cache key.</param>
    /// <param name="ttl">Time to live.</param>
    /// <param name="factory">Value factory.</param>
    /// <returns>The cached or created value.</returns>
    Task<string> GetOrCreateAsync(string key, TimeSpan ttl, Func<Task<string>> factory);

    /// <summary>
    /// Invalidates request-sensitive cached values.
    /// </summary>
    void InvalidateAfterRequest();

    /// <summary>
    /// Gets the current cache generation.
    /// </summary>
    long Generation { get; }
}
