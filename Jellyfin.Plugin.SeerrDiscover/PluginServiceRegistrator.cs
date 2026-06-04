using Jellyfin.Plugin.SeerrDiscover.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.SeerrDiscover;

/// <summary>
/// Registers plugin services with Jellyfin.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddMemoryCache();
        serviceCollection.AddSingleton<ISeerrDiscoverCache, SeerrDiscoverCache>();
        serviceCollection.AddHttpClient<ISeerrClient, SeerrClient>();
    }
}
