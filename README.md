# Jellyfin Seerr Discover

Seerr Discover is a Jellyfin server plugin that adds Seerr-backed Discover rails and requestable Seerr results inside Jellyfin's native search page. Browser code calls Jellyfin-authenticated plugin endpoints for Seerr traffic; the Seerr API key stays on the Jellyfin server.

## Status

Seerr Discover is distributed as a stable third-party Jellyfin plugin through a self-hosted Jellyfin plugin repository. The `0.3.x` line is the supported release line for repository installs.

Repository URL:

```text
https://omgwtfwow.github.io/jellyfin-plugin-seerr-discover/manifest.json
```

## Quick Start

1. Add the repository URL in Jellyfin: Dashboard > Plugins > Repositories.
2. Install Seerr Discover from Dashboard > Plugins > Catalog, then restart Jellyfin.
3. Configure Seerr Discover with your internal Seerr URL, public Seerr URL, and Seerr API key.
4. Install and configure the companion plugins listed below.
5. Hard-refresh Jellyfin Web or restart the client app.
6. Use Jellyfin's normal search page for Seerr search results; use the Discover tab for browse rails.

## Screenshots

These screenshots were captured from a live Jellyfin Web session and show the plugin UI without configuration pages or API secrets.

| Discover rails | Native search integration |
| --- | --- |
| ![Screenshot of Seerr Discover browse rails in Jellyfin Web](docs/assets/screenshots/discover-rails.jpg) | ![Screenshot of requestable Seerr results in Jellyfin native search](docs/assets/screenshots/native-search.jpg) |

| Detail modal | Mobile layout |
| --- | --- |
| ![Screenshot of the Seerr Discover detail modal](docs/assets/screenshots/detail-modal.jpg) | ![Screenshot of Seerr Discover on a narrow mobile layout](docs/assets/screenshots/mobile-layout.jpg) |

## Requirements

- Jellyfin Server `10.11.x`; current releases target `targetAbi: 10.11.10.0`
- Seerr reachable from the Jellyfin server
- Seerr API key
- Seerr Jellyfin user import/mapping enabled for request creation
- Custom Tabs plugin
- JavaScript Injector plugin
- File Transformation plugin, if required by your JavaScript Injector installation

Custom Tabs and JavaScript Injector are intentional dependencies for the v1 UI surface. The server plugin provides the API proxy and web asset; Custom Tabs provides the Jellyfin Web mount point. See [Companion Plugins](docs/COMPANION-PLUGINS.md).

## Features

- Rails-only Discover tab for configurable Trending Movies, Trending TV, Popular Movies, Popular TV, and Upcoming Movies rows
- Requestable Seerr movie and series results inside Jellyfin's native search page
- Detail modal with poster/backdrop, metadata, cast/crew, trailers, and Seerr links
- Request creation as the mapped Seerr user
- Available/requested/requestable state badges
- Watch Now and Open Details handoff for available Jellyfin items
- Theme-aware Jellyfin Web styling
- Server-side cache for discover, details, search, and mapped user lookups

## Compatibility

| Client or surface | Status | Notes |
| --- | --- | --- |
| Jellyfin Web | Supported | Primary target. |
| Jellyfin Desktop | Supported through Jellyfin Web UI | Hard refresh or client restart may be required after loader changes. |
| Jellyfin mobile apps | Best effort through embedded web UI | Trailer handoff behavior depends on the client/webview. |
| Android TV and native TV clients | Not supported | These clients do not expose the custom Jellyfin Web tab surface. |

## Installation and Setup

See [docs/INSTALL.md](docs/INSTALL.md).

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) if the plugin does not appear, the Discover tab is blank, or the client needs a cache refresh.

## Configuration

Open Jellyfin Dashboard > Plugins > Seerr Discover.

- `Seerr base URL`: internal URL from Jellyfin to Seerr, for example `http://seerr:5055`
- `Seerr public URL`: browser URL for Open in Seerr links, for example `https://seerr.example.com`
- `Seerr API key`: write-only in the config page; blank preserves the existing key
- cache TTLs: bounded between 5 and 3600 seconds
- `Require mapped Seerr users`: recommended and enabled by default
- `Show Seerr results in Jellyfin search`: recommended and enabled by default

## Security

- The Seerr API key is sent only from Jellyfin server code to Seerr.
- The browser asset calls `/SeerrDiscover/*` with Jellyfin authentication for Seerr traffic.
- The admin config page uses redacted plugin-owned endpoints so the stored API key is not written into the page.
- Request creation requires a mapped Jellyfin/Seerr user by default.

## Development

```bash
dotnet restore Jellyfin.Plugin.SeerrDiscover.sln
dotnet test Jellyfin.Plugin.SeerrDiscover.sln
dotnet build Jellyfin.Plugin.SeerrDiscover/Jellyfin.Plugin.SeerrDiscover.csproj -c Release
node --check Jellyfin.Plugin.SeerrDiscover/Web/discover.js
bash -n scripts/package-plugin.sh scripts/generate-manifest.sh
shellcheck scripts/*.sh
```

Build a release zip:

```bash
scripts/package-plugin.sh
```

Generate a Jellyfin repository manifest for the built zip:

```bash
version="$(sed -n 's:.*<Version>\\(.*\\)</Version>.*:\\1:p' Directory.Build.props | head -n1)"
scripts/generate-manifest.sh \
  --base-url "https://github.com/omgwtfwow/jellyfin-plugin-seerr-discover/releases/download/v${version}"
```

## Support

When reporting issues, include:

- Jellyfin server version
- Seerr Discover version
- Custom Tabs, JavaScript Injector, and File Transformation versions
- Client type: browser, Jellyfin Desktop, iOS, Android, or other
- Redacted Jellyfin logs and browser console errors
