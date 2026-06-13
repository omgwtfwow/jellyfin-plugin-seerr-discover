# Plugin Listing Metadata QA - 2026-06-13

## Scope

QA sign-off for milestone #10 and issue #112, covering the plugin listing image
and manifest metadata delivery for issue #29.

## Delivered

| Issue | PR | Outcome |
| --- | --- | --- |
| #29 Add plugin listing image and manifest metadata | #113 | Added `docs/assets/seerr-discover-icon.png`, configured `imageUrl` in `build.yaml`, emitted `imageUrl` in generated manifests, and published the icon through the GitHub Pages repository workflow. |

## Verification

Source checks:

- `bash -n scripts/package-plugin.sh scripts/generate-manifest.sh`
- `shellcheck scripts/*.sh`
- `node --check Jellyfin.Plugin.SeerrDiscover/Web/discover.js`
- `git diff --check`
- `gitleaks detect --no-git --source .`

Image and manifest checks:

- `docs/assets/seerr-discover-icon.png` is a `PNG 1024x1024 RGBA` asset.
- `scripts/generate-manifest.sh --base-url <release-url>` emits top-level
  `imageUrl`.
- Generated manifest keeps the release zip `sourceUrl`.
- Generated manifest still emits a 32-character MD5 checksum.

Build/package checks:

- Dockerized .NET SDK 9 `dotnet test Jellyfin.Plugin.SeerrDiscover.sln`
  passed with 73 tests.
- Dockerized `scripts/package-plugin.sh` created
  `dist/seerr-discover_1.0.0.0.zip`.
- Dockerized manifest generation created `dist/manifest.json` with the expected
  `imageUrl`.

GitHub checks:

- PR #113 `build` check passed before squash merge.

## Caveats

- No release tag was cut during this QA pass. The next release and plugin
  repository publish will expose the Pages icon URL.

## Sign-Off

Result: Pass.

The plugin listing metadata implementation is merged and verified. Issue #112
can close after this QA record is merged.
