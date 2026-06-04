# Installation

## Manual Zip Install

1. Download `seerr-discover_<version>.zip` from the GitHub release.
2. Stop Jellyfin.
3. Create a plugin directory under your Jellyfin config path, for example:

   ```text
   config/plugins/Seerr Discover_0.2.0.0/
   ```

4. Extract the zip contents into that directory.
5. Start Jellyfin.
6. Open Dashboard > Plugins and confirm Seerr Discover is active.
7. Configure Seerr Discover with your internal Seerr URL and API key.

## Jellyfin Repository Install

After a release publishes `manifest.json`, add its raw URL in:

```text
Dashboard > Plugins > Repositories
```

Then install Seerr Discover from the plugin catalog page and restart Jellyfin.

## Discover Tab Setup

The server plugin does not create a Jellyfin Web navigation tab by itself. Configure these companion plugins:

- Custom Tabs: add a tab named `Discover` with:

  ```html
  <div class="sections"><div id="seerrDiscoverRoot"></div></div>
  ```

- JavaScript Injector: add an authenticated script:

  ```js
  (function () {
    if (document.getElementById('seerr-discover-loader')) return;
    var script = document.createElement('script');
    script.id = 'seerr-discover-loader';
    script.defer = true;
    script.src = '/SeerrDiscover/assets/discover.js?v=0.2.0.0';
    document.head.appendChild(script);
  }());
  ```

Hard-refresh Jellyfin Web after changing the tab or loader script.

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
<jellyfin-config>/plugins/Seerr Discover_0.2.0.0/
```

Restart Jellyfin.

## Upgrade Notes

- Existing plugin settings should survive a version upgrade.
- The API key field is write-only in the config page. Leave it blank to preserve the current key.
- Update the JavaScript Injector loader query string to the installed plugin version after upgrading.
