# Blank-Slate Cleanup QA - 2026-06-13

## Scope

Milestone: Media blank-slate cleanup audit 2026-06-13 (#9)

Issues:
- #108 Remove unused default 4K request setting
- #109 QA sign-off for Jellyfin blank-slate cleanup

This QA pass covers the merged cleanup that removed the unused `DefaultRequest4K`
configuration path from the Jellyfin Seerr Discover plugin.

## Delivered Changes

- Removed `DefaultRequest4K` from plugin configuration, API DTOs, controller mapping, admin config UI, and README documentation.
- Kept request payload behavior explicit by defaulting missing `Is4K` values to `false` in `BuildRequestPayload`.
- Added focused regression coverage for the missing `Is4K` default.
- Confirmed no `DefaultRequest4K`, `defaultRequest4K`, `Default 4K requests`, or `Default to 4K requests` source references remain outside ignored build output.

## Local Verification

Environment note: local `dotnet` is unavailable on this machine, so .NET checks used `mcr.microsoft.com/dotnet/sdk:9.0` containers.

- `docker run --rm -v "$PWD":/work -w /work -e NUGET_PACKAGES=/tmp/nuget-qa-test mcr.microsoft.com/dotnet/sdk:9.0 dotnet test Jellyfin.Plugin.SeerrDiscover.sln`
  - Passed: 73 tests, 0 failed, 0 skipped.
- `docker run --rm -v "$PWD":/work -w /work -e NUGET_PACKAGES=/tmp/nuget-qa-build mcr.microsoft.com/dotnet/sdk:9.0 dotnet build Jellyfin.Plugin.SeerrDiscover/Jellyfin.Plugin.SeerrDiscover.csproj -c Release`
  - Passed with 0 warnings and 0 errors.
- `docker run --rm -v "$PWD":/work -w /work -e NUGET_PACKAGES=/tmp/nuget-qa-package mcr.microsoft.com/dotnet/sdk:9.0 bash -lc 'apt-get update >/dev/null && apt-get install -y python3 zip >/dev/null && ./scripts/package-plugin.sh'`
  - Passed and created `dist/seerr-discover_1.0.0.0.zip`.
- `node --check Jellyfin.Plugin.SeerrDiscover/Web/configPage.js`
  - Passed.
- `node --check Jellyfin.Plugin.SeerrDiscover/Web/discover.js`
  - Passed.
- `bash -n scripts/package-plugin.sh scripts/generate-manifest.sh`
  - Passed.
- `shellcheck scripts/*.sh`
  - Passed.
- `git diff --check`
  - Passed.
- `rg` source scan for removed 4K setting tokens, excluding `bin/`, `obj/`, and `dist/`
  - Passed with no source references.

## Live Read-Only Sanity Check

Host: Hetzner media-streaming stack.

No deployment, restart, configuration change, or destructive action was performed.

- `/home/juan/media-streaming` was at homeserver commit `b8ea690`.
- `media-streaming-jellyfin` was `running`, Docker health was `healthy`, restart count was `0`, and `oom=false`.
- `https://jelly.in8.io/System/Info/Public` returned HTTP `200`.
- `https://jelly.in8.io/SeerrDiscover/assets/discover.js` returned HTTP `200`.
- Served Discover asset did not contain `DefaultRequest4K` or `defaultRequest4K`.
- Jellyfin plugin files were present under `/mnt/docker-data/media-streaming/config/jellyfin/config/plugins/Seerr Discover_1.0.0.0/`.
- Recent Jellyfin logs from the last 30 minutes contained `0` Seerr Discover error/fail/exception lines.

## Sign-Off

The Jellyfin cleanup milestone implementation has been merged, locally verified,
and checked against the live stack without mutation. The cleanup is signed off
for milestone closure.

## Caveats

- No live deploy was performed for this cleanup milestone.
- Browser request flow validation is covered by the merged payload tests and the live Discover asset read-only check; no authenticated browser action was submitted during QA.
