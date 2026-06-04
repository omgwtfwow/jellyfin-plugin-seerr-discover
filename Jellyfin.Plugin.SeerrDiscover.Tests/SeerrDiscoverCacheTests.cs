using System;
using System.Threading.Tasks;
using Jellyfin.Plugin.SeerrDiscover.Services;
using Microsoft.Extensions.Caching.Memory;
using Xunit;

namespace Jellyfin.Plugin.SeerrDiscover.Tests;

public sealed class SeerrDiscoverCacheTests
{
    [Fact]
    public async Task GetOrCreateAsync_ReusesValueUntilInvalidated()
    {
        using var memory = new MemoryCache(new MemoryCacheOptions());
        var cache = new SeerrDiscoverCache(memory);
        var calls = 0;

        var first = await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), () =>
        {
            calls++;
            return Task.FromResult("first");
        });
        var second = await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), () =>
        {
            calls++;
            return Task.FromResult("second");
        });

        cache.InvalidateAfterRequest();
        var third = await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), () =>
        {
            calls++;
            return Task.FromResult("third");
        });

        Assert.Equal("first", first);
        Assert.Equal("first", second);
        Assert.Equal("third", third);
        Assert.Equal(2, calls);
    }
}
