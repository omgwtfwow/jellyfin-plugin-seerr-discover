using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.SeerrDiscover.Configuration;
using Jellyfin.Plugin.SeerrDiscover.Controllers;
using Jellyfin.Plugin.SeerrDiscover.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Xunit;

namespace Jellyfin.Plugin.SeerrDiscover.Tests;

public sealed class SeerrDiscoverControllerTests
{
    [Theory]
    [InlineData("discover.js")]
    [InlineData("configPage.js")]
    public void BrowserAssets_DoNotContainSecretHeadersOrDynamicScriptExecution(string assetName)
    {
        var source = ReadBrowserAsset(assetName);
        var forbiddenFragments = new[]
        {
            "X-Api-Key",
            "Authorization",
            "Bearer ",
            "AccessToken",
            "accessToken"
        };

        foreach (var fragment in forbiddenFragments)
        {
            Assert.DoesNotContain(fragment, source, StringComparison.OrdinalIgnoreCase);
        }

        Assert.DoesNotMatch(new Regex(@"\bnew\s+Function\b|\beval\s*\(", RegexOptions.IgnoreCase), source);
        Assert.DoesNotMatch(new Regex(@"createElement\s*\(\s*['""]script['""]\s*\)", RegexOptions.IgnoreCase), source);
        Assert.DoesNotMatch(new Regex(@"\.src\s*=\s*['""]https?://", RegexOptions.IgnoreCase), source);
        Assert.DoesNotMatch(new Regex(@"\b(atob|btoa)\s*\(|String\.fromCharCode\s*\(", RegexOptions.IgnoreCase), source);
    }

    [Fact]
    public void DiscoverAsset_RoutesPluginApiCallsThroughSeerrDiscoverProxy()
    {
        var source = ReadBrowserAsset("discover.js");
        var matches = Regex.Matches(source, @"\bapiFetch\(\s*(?<quote>['""`])(?<path>[^'""`]+)");
        var paths = matches
            .Select(match => match.Groups["path"].Value)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();

        Assert.NotEmpty(paths);
        Assert.All(paths, path => Assert.StartsWith("/SeerrDiscover/", path, StringComparison.Ordinal));
        Assert.Contains(paths, path => path.StartsWith("/SeerrDiscover/client-config", StringComparison.Ordinal));
        Assert.Contains(paths, path => path.StartsWith("/SeerrDiscover/config", StringComparison.Ordinal));
        Assert.Contains(paths, path => path.StartsWith("/SeerrDiscover/request", StringComparison.Ordinal));
    }

    [Fact]
    public void BrowserAsset_ApiKeyMentionsAreLimitedToWriteOnlyConfigForm()
    {
        var source = ReadBrowserAsset("discover.js");
        var lines = source
            .Split('\n')
            .Select((line, index) => new { Line = line.Trim(), Number = index + 1 })
            .Where(item => item.Line.Contains("ApiKey", StringComparison.OrdinalIgnoreCase)
                || item.Line.Contains("API key", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        Assert.NotEmpty(lines);
        Assert.All(lines, item => Assert.True(
            IsAllowedConfigApiKeyLine(item.Line),
            $"Unexpected API key reference at line {item.Number}: {item.Line}"));
    }

    [Fact]
    public void DiscoverAsset_PrefersJellyfinApiClientBeforeFetchFallback()
    {
        var source = ReadBrowserAsset("discover.js");
        var apiClientFetch = source.IndexOf("window.ApiClient.fetch", StringComparison.Ordinal);
        var fetchFallback = source.IndexOf("return fetch(apiUrl(path)", StringComparison.Ordinal);

        Assert.True(apiClientFetch >= 0, "discover.js should use Jellyfin ApiClient when it is available.");
        Assert.True(fetchFallback > apiClientFetch, "fetch should remain a fallback after the ApiClient path.");
    }

    [Fact]
    public void DiscoverAsset_KeepsIdempotentBrowserMountMarkers()
    {
        var source = ReadBrowserAsset("discover.js");

        Assert.Contains("document.getElementById(styleId)", source, StringComparison.Ordinal);
        Assert.Contains("root.__seerrMounted", source, StringComparison.Ordinal);
        Assert.Contains("window.SeerrDiscoverInitializeConfigPage", source, StringComparison.Ordinal);
    }

    [Fact]
    public void Controller_DefaultsToJellyfinAuthenticatedEndpoints()
    {
        Assert.Contains(
            typeof(SeerrDiscoverController).GetCustomAttributes<AuthorizeAttribute>(inherit: true),
            attribute => string.IsNullOrWhiteSpace(attribute.Roles));
    }

    [Fact]
    public void StaticBrowserAssets_AreTheOnlyAnonymousActions()
    {
        var anonymousActions = ControllerActionMethods()
            .Where(method => method.GetCustomAttributes<AllowAnonymousAttribute>(inherit: true).Any())
            .Select(method => method.Name)
            .Order(StringComparer.Ordinal)
            .ToArray();

        Assert.Equal([nameof(SeerrDiscoverController.GetConfigPageAsset), nameof(SeerrDiscoverController.GetDiscoverAsset)], anonymousActions);
    }

    [Theory]
    [InlineData(nameof(SeerrDiscoverController.GetDiscoverAsset), "assets/discover.js")]
    [InlineData(nameof(SeerrDiscoverController.GetConfigPageAsset), "assets/configPage.js")]
    public void StaticBrowserAssets_AreAnonymousJavaScriptAssets(string methodName, string routeTemplate)
    {
        var method = ControllerAction(methodName);
        var route = Assert.Single(method.GetCustomAttributes<HttpGetAttribute>(inherit: true));
        var produces = Assert.Single(method.GetCustomAttributes<ProducesAttribute>(inherit: true));

        Assert.True(method.GetCustomAttributes<AllowAnonymousAttribute>(inherit: true).Any());
        Assert.Equal(routeTemplate, route.Template);
        Assert.Contains("text/javascript", produces.ContentTypes);
    }

    [Theory]
    [InlineData(nameof(SeerrDiscoverController.GetConfiguration))]
    [InlineData(nameof(SeerrDiscoverController.UpdateConfiguration))]
    [InlineData(nameof(SeerrDiscoverController.GetRailOptions))]
    public void AdminEndpoints_RequireAdministratorRole(string methodName)
    {
        var method = ControllerAction(methodName);
        var authorize = method.GetCustomAttributes<AuthorizeAttribute>(inherit: true);

        Assert.DoesNotContain(method.GetCustomAttributes<AllowAnonymousAttribute>(inherit: true), _ => true);
        Assert.Contains(authorize, attribute => attribute.Roles == "Administrator");
    }

    [Fact]
    public void ConfigurationDto_RedactsStoredApiKey()
    {
        var dto = ToConfigurationDto(new PluginConfiguration
        {
            SeerrApiKey = "stored-secret-value",
            SeerrBaseUrl = "http://seerr:5055",
            SeerrPublicUrl = "https://seerr.example"
        });

        var json = JsonSerializer.Serialize(dto);

        Assert.True(dto.SeerrApiKeyConfigured);
        Assert.DoesNotContain(typeof(SeerrDiscoverConfigurationDto).GetProperties(), property => property.Name == "SeerrApiKey");
        Assert.DoesNotContain("stored-secret-value", json, StringComparison.Ordinal);
        Assert.Contains("SeerrApiKeyConfigured", json, StringComparison.Ordinal);
    }

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
    public void ApplyConfigurationUpdate_SavesExpandedRailSettings()
    {
        var config = new PluginConfiguration();
        var update = new SeerrDiscoverConfigurationUpdate
        {
            SeerrBaseUrl = "http://seerr:5055",
            Language = "en",
            EnableTrending = true,
            EnableTrendingMovies = true,
            EnableTrendingTv = true,
            EnableMovies = true,
            EnableTv = true,
            EnableUpcoming = true,
            EnableUpcomingTv = false,
            EnableRecentlyRequested = true,
            EnablePopularWithServer = true,
            EnableDetailSimilar = true,
            EnableDetailRecommended = true,
            EnableDetailCollections = true,
            ExtraRails =
            [
                new SeerrExtraRailDto
                {
                    Kind = "Genre",
                    MediaType = "Movie",
                    Value = "27",
                    Title = "Horror Movies",
                    Enabled = true
                },
                new SeerrExtraRailDto
                {
                    Kind = "Network",
                    MediaType = "tv",
                    Value = "49",
                    Title = "HBO TV",
                    Enabled = false
                }
            ]
        };

        ApplyConfigurationUpdate(config, update);

        Assert.False(config.EnableUpcomingTv);
        Assert.True(config.EnableRecentlyRequested);
        Assert.True(config.EnablePopularWithServer);
        Assert.True(config.EnableDetailSimilar);
        Assert.True(config.EnableDetailRecommended);
        Assert.True(config.EnableDetailCollections);
        Assert.True(IsFeedEnabled(config, "recently-requested"));
        Assert.True(IsFeedEnabled(config, "server-popular"));
        Assert.True(IsFeedEnabled(config, "genre-movie-27"));
        Assert.False(IsFeedEnabled(config, "network-tv-49"));
    }

    [Fact]
    public void IsFeedEnabled_RejectsUnconfiguredExpandedRails()
    {
        var config = new PluginConfiguration
        {
            EnableRecentlyRequested = false,
            EnablePopularWithServer = false,
            ExtraRails =
            [
                new SeerrExtraRail
                {
                    Kind = "genre",
                    MediaType = "movie",
                    Value = "27",
                    Title = "Horror Movies",
                    Enabled = false
                }
            ]
        };

        Assert.False(IsFeedEnabled(config, "recently-requested"));
        Assert.False(IsFeedEnabled(config, "server-popular"));
        Assert.False(IsFeedEnabled(config, "genre-movie-27"));
        Assert.False(IsFeedEnabled(config, "genre-tv-27"));
    }

    [Fact]
    public void RemoveRequestUserData_StripsRequesterFields()
    {
        var node = JsonNode.Parse("""
        {
          "mediaInfo": {
            "requests": [
              {
                "id": 1,
                "requestedBy": { "email": "user@example.com" },
                "modifiedBy": { "username": "admin" }
              }
            ]
          }
        }
        """);

        var method = typeof(SeerrDiscoverController).GetMethod("RemoveRequestUserData", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        method!.Invoke(null, [node]);
        var json = node!.ToJsonString();
        Assert.DoesNotContain("requestedBy", json);
        Assert.DoesNotContain("modifiedBy", json);
        Assert.Contains("\"id\":1", json);
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

    private static SeerrDiscoverConfigurationDto ToConfigurationDto(PluginConfiguration config)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("ToConfigurationDto", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        return Assert.IsType<SeerrDiscoverConfigurationDto>(method!.Invoke(null, [config]));
    }

    private static bool IsFeedEnabled(PluginConfiguration config, string feed, string? mediaType = null)
    {
        var method = typeof(SeerrDiscoverController).GetMethod("IsFeedEnabled", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        return Assert.IsType<bool>(method!.Invoke(null, [config, feed, mediaType]));
    }

    private static MethodInfo ControllerAction(string methodName)
    {
        var method = typeof(SeerrDiscoverController).GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly);

        Assert.NotNull(method);
        return method!;
    }

    private static IEnumerable<MethodInfo> ControllerActionMethods()
        => typeof(SeerrDiscoverController)
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
            .Where(method => method.GetCustomAttributes<HttpMethodAttribute>(inherit: true).Any());

    private static bool IsAllowedConfigApiKeyLine(string line)
        => line.Contains("apiKeyInput", StringComparison.Ordinal)
            || line.Contains("clearApiKeyInput", StringComparison.Ordinal)
            || line.Contains("apiKeyStatus", StringComparison.Ordinal)
            || line.Contains("querySelector('#SeerrApiKey", StringComparison.Ordinal)
            || line.Contains("config.SeerrApiKeyConfigured", StringComparison.Ordinal)
            || line.Contains("assignConfigValue(config, 'SeerrApiKey'", StringComparison.Ordinal)
            || line.Contains("assignConfigValue(config, 'ClearSeerrApiKey'", StringComparison.Ordinal)
            || line.Contains("Paste Seerr API key", StringComparison.Ordinal)
            || line.Contains("A Seerr API key is configured", StringComparison.Ordinal)
            || line.Contains("No Seerr API key is configured", StringComparison.Ordinal);

    private static string ReadBrowserAsset(string fileName)
    {
        var resourceName = $"Jellyfin.Plugin.SeerrDiscover.Web.{fileName}";
        using var stream = typeof(SeerrDiscoverController).Assembly.GetManifestResourceStream(resourceName);

        Assert.NotNull(stream);
        using var reader = new StreamReader(stream!);
        return reader.ReadToEnd();
    }
}
