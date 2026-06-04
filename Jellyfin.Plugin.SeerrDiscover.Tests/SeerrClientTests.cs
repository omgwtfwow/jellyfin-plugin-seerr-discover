using System.Collections.Generic;
using System.Reflection;
using Jellyfin.Plugin.SeerrDiscover.Models;
using Jellyfin.Plugin.SeerrDiscover.Services;
using Xunit;

namespace Jellyfin.Plugin.SeerrDiscover.Tests;

public sealed class SeerrClientTests
{
    [Theory]
    [InlineData("trending-movies", "mediaType=movie")]
    [InlineData("trending-tv", "mediaType=tv")]
    public void BuildDiscoverPath_SplitsTrendingFeedsByMediaType(string feed, string expectedMediaType)
    {
        var path = BuildDiscoverPath(feed);

        Assert.StartsWith("/api/v1/discover/trending?", path);
        Assert.Contains(expectedMediaType, path);
        Assert.Contains("timeWindow=day", path);
    }

    [Fact]
    public void BuildRequestPayload_OmitsNullOptionalMovieFields()
    {
        var payload = BuildPayload(new SeerrDiscoverRequest
        {
            MediaType = "movie",
            MediaId = 1035190,
            Is4K = false
        }, 1);

        Assert.Equal("movie", payload["mediaType"]);
        Assert.Equal(1035190, payload["mediaId"]);
        Assert.Equal(false, payload["is4k"]);
        Assert.Equal(1, payload["userId"]);
        Assert.DoesNotContain("tvdbId", payload.Keys);
        Assert.DoesNotContain("seasons", payload.Keys);
        Assert.DoesNotContain("serverId", payload.Keys);
        Assert.DoesNotContain("profileId", payload.Keys);
        Assert.DoesNotContain("rootFolder", payload.Keys);
        Assert.DoesNotContain("languageProfileId", payload.Keys);
    }

    [Fact]
    public void BuildRequestPayload_DefaultsTvSeasonsToAll()
    {
        var payload = BuildPayload(new SeerrDiscoverRequest
        {
            MediaType = "tv",
            MediaId = 123
        }, null);

        Assert.Equal("all", payload["seasons"]);
        Assert.DoesNotContain("userId", payload.Keys);
    }

    private static Dictionary<string, object> BuildPayload(SeerrDiscoverRequest request, int? seerrUserId)
    {
        var method = typeof(SeerrClient).GetMethod("BuildRequestPayload", BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);
        return Assert.IsType<Dictionary<string, object>>(method!.Invoke(null, [request, seerrUserId, false]));
    }

    private static string BuildDiscoverPath(string feed)
    {
        var method = typeof(SeerrClient).GetMethod("BuildDiscoverPath", BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);
        return Assert.IsType<string>(method!.Invoke(null, [feed, 1, null, "en"]));
    }
}
