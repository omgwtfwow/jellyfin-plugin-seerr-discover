# Installation

## Jellyfin Repository Install

The public repository serves the latest stable release.

Add the self-hosted repository URL in:

```text
https://omgwtfwow.github.io/jellyfin-plugin-seerr-discover/manifest.json
```

Jellyfin path:

```text
Dashboard > Plugins > Repositories
```

Then install Seerr Discover from:

```text
Dashboard > Plugins > Catalog
```

Restart Jellyfin after installation. Open Dashboard > Plugins > Seerr Discover and configure your internal Seerr URL, public Seerr URL, and Seerr API key. Keep `Show Seerr results in Jellyfin search` enabled unless you intentionally want the Discover tab only.

## Release-Asset Fallback

If GitHub Pages is temporarily unavailable, stable installs can use the `manifest.json` attached to the latest GitHub release:

```text
https://github.com/omgwtfwow/jellyfin-plugin-seerr-discover/releases/latest/download/manifest.json
```

## Manual Zip Install

Use this only when repository installation is unavailable.

1. Download `seerr-discover_<installed-version>.zip` from the GitHub release.
2. Stop Jellyfin.
3. Create a plugin directory under your Jellyfin config path, for example:

   ```text
   config/plugins/Seerr Discover_<installed-version>/
   ```

4. Extract the zip contents into that directory.
5. Start Jellyfin.
6. Open Dashboard > Plugins and confirm Seerr Discover is active.
7. Configure Seerr Discover with your internal Seerr URL and API key.

## Companion Plugins

The rails-only Discover tab uses companion Jellyfin Web plugins. The same loader also attaches Seerr results to Jellyfin's native search page. See [COMPANION-PLUGINS.md](COMPANION-PLUGINS.md) for dependency setup and known-compatible configuration.

## Discover Tab Setup

The server plugin does not create a Jellyfin Web navigation tab by itself. Configure these companion plugins after Seerr Discover is installed.

Custom Tabs: add a tab named `Discover` with:

```html
<div class="sections"><div id="seerrDiscoverRoot"></div></div>
```

JavaScript Injector: add an authenticated script.

```js
(function () {
  if (document.getElementById('seerr-discover-loader')) return;
  var script = document.createElement('script');
  script.id = 'seerr-discover-loader';
  script.defer = true;
  script.src = '/SeerrDiscover/assets/discover.js';
  document.head.appendChild(script);
}());
```

Hard-refresh Jellyfin Web after changing the tab or loader script. In Jellyfin Desktop or mobile app webviews, fully close and reopen the client if the old script remains cached.

After setup, the Discover tab shows browse rails only. Search from Jellyfin's normal search page; matching Seerr items appear in a separate `Requestable from Seerr` row when native search integration is enabled.

## Docker Development Install

Build the plugin:

```bash
dotnet build Jellyfin.Plugin.SeerrDiscover/Jellyfin.Plugin.SeerrDiscover.csproj -c Release
```

Copy the output files from:

```text
Jellyfin.Plugin.SeerrDiscover/bin/Release/net9.0/
```

into:

```text
<jellyfin-config>/plugins/Seerr Discover_<installed-version>/
```

Restart Jellyfin.

## Upgrade Notes

- Existing plugin settings should survive a version upgrade.
- The API key field is write-only in the config page. Leave it blank to preserve the current key.
- No JavaScript Injector query string update is required after upgrading. Keep the loader pointed at `/SeerrDiscover/assets/discover.js`, then hard-refresh Jellyfin Web or restart the client app.
- The Discover tab no longer has a separate search bar; use Jellyfin's native search page for Seerr search.
