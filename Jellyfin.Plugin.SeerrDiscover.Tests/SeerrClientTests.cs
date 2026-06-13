using System;
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
    public void BuildDiscoverPath_RejectsLegacyMixedTrendingFeed()
    {
        var method = typeof(SeerrClient).GetMethod("BuildDiscoverPath", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        var exception = Assert.Throws<TargetInvocationException>(() => method!.Invoke(null, ["trending", 1, null, "en"]));
        Assert.IsType<ArgumentException>(exception.InnerException);
    }

    [Theory]
    [InlineData("upcoming-tv", "/api/v1/discover/tv/upcoming?")]
    [InlineData("genre-movie-27", "/api/v1/discover/movies/genre/27?")]
    [InlineData("genre-tv-35", "/api/v1/discover/tv/genre/35?")]
    [InlineData("studio-movie-41077", "/api/v1/discover/movies/studio/41077?")]
    [InlineData("network-tv-49", "/api/v1/discover/tv/network/49?")]
    [InlineData("language-movie-ko", "/api/v1/discover/movies/language/ko?")]
    [InlineData("language-tv-ja", "/api/v1/discover/tv/language/ja?")]
    [InlineData("keyword-movie-9663", "/api/v1/discover/keyword/9663/movies?")]
    public void BuildDiscoverPath_MapsExpandedDiscoverFeeds(string feed, string expectedPrefix)
    {
        var path = BuildDiscoverPath(feed);

        Assert.StartsWith(expectedPrefix, path);
        Assert.Contains("page=1", path);
        Assert.Contains("language=en", path);
    }

    [Fact]
    public void BuildDiscoverPath_MapsTvKeywordFeedsThroughTvDiscoverKeywords()
    {
        var path = BuildDiscoverPath("keyword-tv-9663");

        Assert.StartsWith("/api/v1/discover/tv?", path);
        Assert.Contains("keywords=9663", path);
        Assert.Contains("sortBy=popularity.desc", path);
        Assert.Contains("page=1", path);
        Assert.Contains("language=en", path);
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

    [Fact]
    public void BuildRequestPayload_DefaultsMissingIs4KToFalse()
    {
        var payload = BuildPayload(new SeerrDiscoverRequest
        {
            MediaType = "movie",
            MediaId = 1035190
        }, null);

        Assert.Equal(false, payload["is4k"]);
    }

    private static Dictionary<string, object> BuildPayload(SeerrDiscoverRequest request, int? seerrUserId)
    {
        var method = typeof(SeerrClient).GetMethod("BuildRequestPayload", BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);
        return Assert.IsType<Dictionary<string, object>>(method!.Invoke(null, [request, seerrUserId]));
    }

    private static string BuildDiscoverPath(string feed)
    {
        var method = typeof(SeerrClient).GetMethod("BuildDiscoverPath", BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);
        return Assert.IsType<string>(method!.Invoke(null, [feed, 1, null, "en"]));
    }
}
