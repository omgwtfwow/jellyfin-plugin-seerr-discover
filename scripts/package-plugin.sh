#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT_DIR/Jellyfin.Plugin.SeerrDiscover/Jellyfin.Plugin.SeerrDiscover.csproj"
OUTPUT_DIR="$ROOT_DIR/Jellyfin.Plugin.SeerrDiscover/bin/Release/net9.0"
DIST_DIR="$ROOT_DIR/dist"
STAGING_DIR="$DIST_DIR/plugin"

version="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' "$ROOT_DIR/Directory.Build.props" | head -n1)"
guid="$(sed -n 's/^guid: "\(.*\)"/\1/p' "$ROOT_DIR/build.yaml" | head -n1)"
target_abi="$(sed -n 's/^targetAbi: "\(.*\)"/\1/p' "$ROOT_DIR/build.yaml" | head -n1)"
zip_path="$DIST_DIR/seerr-discover_${version}.zip"
release_changelog="Prepare third-party release documentation and improve Discover tab spacing in desktop and mobile Jellyfin web clients."

if [ -z "$version" ] || [ -z "$guid" ] || [ -z "$target_abi" ]; then
  echo "Unable to read version, guid, or targetAbi." >&2
  exit 1
fi

command -v dotnet >/dev/null 2>&1 || {
  echo "dotnet is required." >&2
  exit 1
}

command -v zip >/dev/null 2>&1 || {
  echo "zip is required." >&2
  exit 1
}

rm -rf "$DIST_DIR"
mkdir -p "$STAGING_DIR"

dotnet restore "$ROOT_DIR/Jellyfin.Plugin.SeerrDiscover.sln"
dotnet build "$PROJECT" -c Release --no-restore

install -m 0644 "$OUTPUT_DIR/Jellyfin.Plugin.SeerrDiscover.dll" "$STAGING_DIR/"
install -m 0644 "$OUTPUT_DIR/Jellyfin.Plugin.SeerrDiscover.deps.json" "$STAGING_DIR/"
install -m 0644 "$OUTPUT_DIR/Jellyfin.Plugin.SeerrDiscover.xml" "$STAGING_DIR/"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%S.0000000Z)"
cat >"$STAGING_DIR/meta.json" <<META
{
  "category": "General",
  "changelog": "$release_changelog",
  "description": "Native Jellyfin Discover page backed by Seerr API proxy endpoints.",
  "guid": "$guid",
  "name": "Seerr Discover",
  "overview": "Native Seerr Discover page",
  "owner": "omgwtfwow",
  "targetAbi": "$target_abi",
  "timestamp": "$timestamp",
  "version": "$version",
  "status": "Restart",
  "autoUpdate": false,
  "assemblies": []
}
META

(
  cd "$STAGING_DIR"
  zip -qr "$zip_path" .
)

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$DIST_DIR"
    sha256sum "$(basename "$zip_path")" >"$(basename "$zip_path").sha256"
  )
else
  (
    cd "$DIST_DIR"
    shasum -a 256 "$(basename "$zip_path")" >"$(basename "$zip_path").sha256"
  )
fi

echo "Created $zip_path"
