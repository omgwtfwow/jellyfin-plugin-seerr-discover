# Release Process

1. Update `Directory.Build.props`, `build.yaml`, and `CHANGELOG.md`.
2. Run local checks:

   ```bash
   version="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' Directory.Build.props | head -n1)"
   dotnet test Jellyfin.Plugin.SeerrDiscover.sln
   node --check Jellyfin.Plugin.SeerrDiscover/Web/discover.js
   bash -n scripts/package-plugin.sh scripts/generate-manifest.sh
   shellcheck scripts/*.sh
   scripts/package-plugin.sh
   scripts/generate-manifest.sh --base-url "https://github.com/omgwtfwow/jellyfin-plugin-seerr-discover/releases/download/v${version}"
   ```

3. Commit and tag:

   ```bash
   git tag "v${version}"
   git push origin main "v${version}"
   ```

4. Confirm the GitHub release contains:

   - `seerr-discover_<version>.zip`
   - `seerr-discover_<version>.zip.sha256`
   - `manifest.json`

5. Install from the release zip on a clean Jellyfin instance.
6. Publish or refresh the self-hosted Jellyfin repository:

   ```bash
   gh workflow run plugin-repository.yml
   ```

7. Install from the generated manifest URL on a clean Jellyfin instance:

   ```text
   https://omgwtfwow.github.io/jellyfin-plugin-seerr-discover/manifest.json
   ```

8. Verify the release-asset fallback still works:

   ```text
   https://github.com/omgwtfwow/jellyfin-plugin-seerr-discover/releases/download/v<version>/manifest.json
   ```

9. Complete live visual QA before marking the release as stable.

## Release Posture

- `0.3.x` is the stable third-party release line distributed through the self-hosted Jellyfin plugin repository.
- Stable releases use plain four-part tags such as `v0.3.0.0`.
- Prereleases use tag markers such as `-rc`, `-beta`, or `-alpha`; only those tags are marked prerelease on GitHub.
- Keep release assets compatible with Jellyfin repository installs: plugin zip, SHA-256 checksum, and `manifest.json`.

## GitHub Markdown Hygiene

When scripting issue bodies, comments, PR descriptions, or release notes, always write the body through a heredoc/body file or `jq --arg` JSON generation:

```bash
cat > /tmp/body.md <<'MARKDOWN'
## Delivered

- Real Markdown newlines.
MARKDOWN

gh issue comment 1 --body-file /tmp/body.md
```

Do not pass Markdown with literal `\n` escape sequences to `gh --body`; GitHub renders those as text and the issue becomes unreadable.
