using System.Text.Json;
using Jellyfin.Plugin.SeerrDiscover.Configuration;
using Xunit;

namespace Jellyfin.Plugin.SeerrDiscover.Tests;

public sealed class PluginConfigurationTests
{
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
}
