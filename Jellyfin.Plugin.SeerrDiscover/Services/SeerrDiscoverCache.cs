using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;

namespace Jellyfin.Plugin.SeerrDiscover.Services;

/// <summary>
/// In-memory cache for Seerr proxy calls.
/// </summary>
public sealed class SeerrDiscoverCache : ISeerrDiscoverCache
{
    private readonly IMemoryCache _cache;
    private long _generation;

    /// <summary>
    /// Initializes a new instance of the <see cref="SeerrDiscoverCache"/> class.
    /// </summary>
    /// <param name="cache">Memory cache.</param>
    public SeerrDiscoverCache(IMemoryCache cache)
    {
        _cache = cache;
    }

    /// <inheritdoc />
    public long Generation => Interlocked.Read(ref _generation);

    /// <inheritdoc />
    public Task<string> GetOrCreateAsync(string key, TimeSpan ttl, Func<Task<string>> factory)
    {
        var generationKey = string.Concat(Generation.ToString(System.Globalization.CultureInfo.InvariantCulture), ":", key);
        return _cache.GetOrCreateAsync(generationKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = ttl;
            return await factory().ConfigureAwait(false);
        })!;
    }

    /// <inheritdoc />
    public void InvalidateAfterRequest()
    {
        Interlocked.Increment(ref _generation);
    }
}
