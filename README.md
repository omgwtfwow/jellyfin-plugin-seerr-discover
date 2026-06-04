# Jellyfin Seerr Discover

Seerr Discover is a Jellyfin server plugin that adds a native-looking Discover tab backed by Seerr. Browser code calls Jellyfin-authenticated plugin endpoints only; the Seerr API key stays on the Jellyfin server.

## Status

This repository is preparing for a public `0.2.0.0` release candidate. The long-term target is official Jellyfin plugin catalog submission, but the first supported install paths are manual zip installation and a self-hosted Jellyfin plugin repository.

## Requirements

- Jellyfin Server `10.11.x` matching `targetAbi: 10.11.10.0`
- Seerr reachable from the Jellyfin server
- Seerr API key
- Seerr Jellyfin user import/mapping enabled for request creation
- Custom Tabs plugin
- JavaScript Injector plugin
- File Transformation plugin, if required by your JavaScript Injector installation

Custom Tabs and JavaScript Injector are intentional dependencies for the v1 UI surface. The server plugin provides the API proxy and web asset; Custom Tabs provides the Jellyfin Web mount point.

## Features

- Discover rails for trending, popular movies, popular TV, and upcoming movies
- Search across movies and TV
- Detail modal with poster/backdrop, metadata, cast/crew, trailers, and Seerr links
- Request creation as the mapped Seerr user
- Available/requested/requestable state badges
- Watch Now and Open Details handoff for available Jellyfin items
- Theme-aware Jellyfin Web styling
- Server-side cache for discover, details, search, and mapped user lookups

## Installation

See [docs/INSTALL.md](docs/INSTALL.md).

## Configuration

Open Jellyfin Dashboard > Plugins > Seerr Discover.

- `Seerr base URL`: internal URL from Jellyfin to Seerr, for example `http://seerr:5055`
- `Seerr public URL`: browser URL for Open in Seerr links, for example `https://seerr.example.com`
- `Seerr API key`: write-only in the config page; blank preserves the existing key
- cache TTLs: bounded between 5 and 3600 seconds
- `Require mapped Seerr users`: recommended and enabled by default

## Security

- The Seerr API key is sent only from Jellyfin server code to Seerr.
- The browser asset calls `/SeerrDiscover/*` with Jellyfin authentication.
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
scripts/generate-manifest.sh \
  --base-url "https://github.com/omgwtfwow/jellyfin-plugin-seerr-discover/releases/download/v0.2.0.0"
```

## Catalog candidacy

See [docs/CATALOG-CANDIDACY.md](docs/CATALOG-CANDIDACY.md).
