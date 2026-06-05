using System.Text.Json;
using Jellyfin.Plugin.SeerrDiscover.Configuration;
using Xunit;

namespace Jellyfin.Plugin.SeerrDiscover.Tests;

public sealed class PluginConfigurationTests
{
    [Fact]
    public void Defaults_EnableNativeSearchIntegration()
    {
        var configuration = new PluginConfiguration();

        Assert.True(configuration.EnableNativeSearchIntegration);
    }

    [Fact]
    public void SeerrPublicUrl_RoundTripsThroughJson()
    {
        var configuration = new PluginConfiguration
        {
            SeerrPublicUrl = "https://seerr.example.com"
        };

        var json = JsonSerializer.Serialize(configuration);
        var restored = JsonSerializer.Deserialize<PluginConfiguration>(json);

        Assert.NotNull(restored);
        Assert.Equal("https://seerr.example.com", restored!.SeerrPublicUrl);
    }

    [Fact]
    public void RailPresentation_RoundTripsThroughJson()
    {
        var configuration = new PluginConfiguration
        {
            DiscoverRailPresentation =
            [
                new SeerrRailPresentation { Id = "movies", ArtworkLayout = "horizontal", Title = "Movies Tonight" }
            ],
            DetailRailPresentation =
            [
                new SeerrRailPresentation { Id = "recommended", ArtworkLayout = "horizontal", Title = "Recommended Next" }
            ]
        };

        var json = JsonSerializer.Serialize(configuration);
        var restored = JsonSerializer.Deserialize<PluginConfiguration>(json);

        Assert.NotNull(restored);
        Assert.Equal("movies", restored!.DiscoverRailPresentation[0].Id);
        Assert.Equal("horizontal", restored.DiscoverRailPresentation[0].ArtworkLayout);
        Assert.Equal("Movies Tonight", restored.DiscoverRailPresentation[0].Title);
        Assert.Equal("recommended", restored.DetailRailPresentation[0].Id);
        Assert.Equal("horizontal", restored.DetailRailPresentation[0].ArtworkLayout);
        Assert.Equal("Recommended Next", restored.DetailRailPresentation[0].Title);
    }
}
