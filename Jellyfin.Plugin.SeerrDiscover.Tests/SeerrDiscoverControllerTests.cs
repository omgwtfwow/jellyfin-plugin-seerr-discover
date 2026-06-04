using System.Reflection;
using Jellyfin.Plugin.SeerrDiscover.Configuration;
using Jellyfin.Plugin.SeerrDiscover.Controllers;
using Jellyfin.Plugin.SeerrDiscover.Models;
using Xunit;

namespace Jellyfin.Plugin.SeerrDiscover.Tests;

public sealed class SeerrDiscoverControllerTests
{
    [Theory]
    [InlineData("{\"message\":\"Request for this media already exists.\"}", "Request for this media already exists.")]
    [InlineData("{\"error\":\"quota_exceeded\"}", "quota_exceeded")]
    [InlineData("{\"message\":[\"first\",\"second\"]}", "first; second")]
    public void ExtractSeerrMessage_ReadsUsefulFailureText(string responseBody, string expected)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("ExtractSeerrMessage", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        Assert.Equal(expected, method!.Invoke(null, [responseBody]));
    }

    [Theory]
    [InlineData("plain failure")]
    [InlineData("{\"message\":{\"detail\":\"do not leak structured payloads\"}}")]
    public void ExtractSeerrMessage_RedactsUnsafeFailureText(string responseBody)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("ExtractSeerrMessage", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        Assert.Null(method!.Invoke(null, [responseBody]));
    }

    [Fact]
    public void ApplyConfigurationUpdate_PreservesStoredApiKeyWhenBlank()
    {
        var config = new PluginConfiguration
        {
            SeerrApiKey = "stored-secret",
            SeerrBaseUrl = "http://old:5055",
            SeerrPublicUrl = "https://old.example",
            Language = "en"
        };
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = " http://seerr:5055 ",
            SeerrPublicUrl = " https://seerr.example/ ",
            SeerrApiKey = "",
            Language = " es ",
            DiscoverCacheSeconds = 600,
            DetailsCacheSeconds = 300,
            SearchCacheSeconds = 60,
            UserCacheSeconds = 60,
            RequireMappedUser = true,
            EnableNativeSearchIntegration = true,
            EnableTrending = true,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true
        };

        ApplyConfigurationUpdate(config, update);

        Assert.Equal("stored-secret", config.SeerrApiKey);
        Assert.Equal("http://seerr:5055", config.SeerrBaseUrl);
        Assert.Equal("https://seerr.example", config.SeerrPublicUrl);
        Assert.Equal("es", config.Language);
        Assert.True(config.EnableNativeSearchIntegration);
    }

    [Fact]
    public void LegacyDisabledTrending_DisablesSplitTrendingUntilSettingsAreSaved()
    {
        var config = new PluginConfiguration
        {
            EnableTrending = false,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            UseSplitTrendingRailSettings = false
        };

        Assert.False(IsFeedEnabled(config, "trending-movies"));
        Assert.False(IsFeedEnabled(config, "trending-tv"));
    }

    [Fact]
    public void ApplyConfigurationUpdate_SplitTrendingSettingsDoNotDependOnLegacyTrending()
    {
        var config = new PluginConfiguration
        {
            EnableTrending = false,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            UseSplitTrendingRailSettings = false
        };
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            EnableTrending = false,
            EnableTrendingMovies = true,
            EnableTrendingTv = false,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true
        };

        ApplyConfigurationUpdate(config, update);

        Assert.True(config.UseSplitTrendingRailSettings);
        Assert.True(config.EnableTrending);
        Assert.True(IsFeedEnabled(config, "trending-movies"));
        Assert.False(IsFeedEnabled(config, "trending-tv"));
    }

    [Fact]
    public void ApplyConfigurationUpdate_LegacyTrendingUpdateStillControlsSplitTrendingWhenNewFieldsAreMissing()
    {
        var config = new PluginConfiguration();
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            EnableTrending = false,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true
        };

        ApplyConfigurationUpdate(config, update);

        Assert.False(config.EnableTrending);
        Assert.False(config.EnableTrendingMovies);
        Assert.False(config.EnableTrendingTv);
        Assert.False(IsFeedEnabled(config, "trending-movies"));
        Assert.False(IsFeedEnabled(config, "trending-tv"));
    }

    [Fact]
    public void ApplyConfigurationUpdate_CanDisableNativeSearchIntegration()
    {
        var config = new PluginConfiguration
        {
            EnableNativeSearchIntegration = true
        };
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            DiscoverCacheSeconds = 600,
            DetailsCacheSeconds = 300,
            SearchCacheSeconds = 60,
            UserCacheSeconds = 60,
            EnableNativeSearchIntegration = false
        };

        ApplyConfigurationUpdate(config, update);

        Assert.False(config.EnableNativeSearchIntegration);
    }

    [Fact]
    public void ApplyConfigurationUpdate_ClearsStoredApiKeyOnlyWhenRequested()
    {
        var config = new PluginConfiguration { SeerrApiKey = "stored-secret" };
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            ClearSeerrApiKey = true
        };

        ApplyConfigurationUpdate(config, update);

        Assert.Empty(config.SeerrApiKey);
    }

    private static void ApplyConfigurationUpdate(PluginConfiguration config, SeerrDiscoverConfigurationUpdate update)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("ApplyConfigurationUpdate", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        method!.Invoke(null, [config, update]);
    }

    private static bool IsFeedEnabled(PluginConfiguration config, string feed, string? mediaType = null)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("IsFeedEnabled", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        return Assert.IsType<bool>(method!.Invoke(null, [config, feed, mediaType]));
    }
}
