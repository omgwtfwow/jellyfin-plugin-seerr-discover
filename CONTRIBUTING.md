# Contributing

## Local Checks

Run these before opening a pull request:

```bash
dotnet test Jellyfin.Plugin.SeerrDiscover.sln
dotnet build Jellyfin.Plugin.SeerrDiscover/Jellyfin.Plugin.SeerrDiscover.csproj -c Release
node --check Jellyfin.Plugin.SeerrDiscover/Web/discover.js
bash -n scripts/package-plugin.sh scripts/generate-manifest.sh
shellcheck scripts/*.sh
```

## Pull Requests

- Keep changes focused.
- Include test coverage for security, request, cache, or UI behavior changes.
- Do not commit build output, Jellyfin config folders, plugin install folders, `.env` files, or screenshots containing tokens.
- Update `CHANGELOG.md` for user-visible changes.

## Compatibility

The plugin currently targets Jellyfin `10.11.x` and .NET `9.0`. Changes that alter the target Jellyfin ABI must update `build.yaml`, `Directory.Build.props`, install docs, and release notes together.
