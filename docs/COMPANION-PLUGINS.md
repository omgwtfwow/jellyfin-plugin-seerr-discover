# Companion Plugins

Seerr Discover uses a server plugin for API proxying and a small Jellyfin Web asset for the rails-only Discover page plus native Jellyfin search integration. Jellyfin server plugins do not provide a stable end-user navigation page surface by themselves, so the v1 Discover tab intentionally uses companion Jellyfin Web plugins.

## Required Plugins

- Custom Tabs: creates the `Discover` tab and mount point for browse rails.
- JavaScript Injector: loads the Seerr Discover web asset in Jellyfin Web and lets it attach to native Jellyfin search.
- File Transformation: required by some JavaScript Injector installations and commonly installed alongside it.

Use versions compatible with your Jellyfin server version. If a companion plugin does not appear in Jellyfin's catalog after adding its repository, check that its `targetAbi` matches your Jellyfin version.

## Known Repository Sources

These are third-party plugin repositories commonly used for the companion plugin chain. Verify upstream docs before installing.

```text
https://www.iamparadox.dev/jellyfin/plugins/manifest.json
```

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/10.11/manifest.json
```

## Custom Tabs Configuration

Create a tab named `Discover` with this content:

```html
<div class="sections"><div id="seerrDiscoverRoot"></div></div>
```

Keep the `seerrDiscoverRoot` id unchanged. The Seerr Discover asset looks for that root and mounts the UI there.

## JavaScript Injector Configuration

Create an authenticated JavaScript entry:

```js
(function () {
  if (document.getElementById('seerr-discover-loader')) return;
  var script = document.createElement('script');
  script.id = 'seerr-discover-loader';
  script.defer = true;
  script.src = '/SeerrDiscover/assets/discover.js?v=<installed-version>';
  document.head.appendChild(script);
}());
```

Replace `<installed-version>` with the version shown on the Jellyfin plugin details page.

## After Changes

- Restart Jellyfin after installing or upgrading plugins.
- Hard-refresh Jellyfin Web after changing Custom Tabs or JavaScript Injector settings.
- In Jellyfin Desktop or mobile app webviews, fully quit and reopen the client if the old asset remains cached.
- If the Discover page is blank, open browser dev tools and check whether `/SeerrDiscover/assets/discover.js?v=<installed-version>` returns `200`.
