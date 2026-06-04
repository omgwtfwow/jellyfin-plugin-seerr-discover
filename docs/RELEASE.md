# Release Process

1. Update `Directory.Build.props`, `build.yaml`, and `CHANGELOG.md`.
2. Run local checks:

   ```bash
   dotnet test Jellyfin.Plugin.SeerrDiscover.sln
   node --check Jellyfin.Plugin.SeerrDiscover/Web/discover.js
   bash -n scripts/package-plugin.sh scripts/generate-manifest.sh
   shellcheck scripts/*.sh
   scripts/package-plugin.sh
   scripts/generate-manifest.sh --base-url "https://github.com/omgwtfwow/jellyfin-plugin-seerr-discover/releases/download/v0.2.0.0"
   ```

3. Commit and tag:

   ```bash
   git tag v0.2.0.0
   git push origin main v0.2.0.0
   ```

4. Confirm the GitHub release contains:

   - `seerr-discover_0.2.0.0.zip`
   - `seerr-discover_0.2.0.0.zip.sha256`
   - `manifest.json`

5. Install from the release zip on a clean Jellyfin instance.
6. Install from the generated manifest URL on a clean Jellyfin instance.
7. Complete live visual QA before marking the release as stable.
