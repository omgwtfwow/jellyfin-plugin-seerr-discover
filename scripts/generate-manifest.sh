#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
base_url=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url)
      base_url="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$base_url" ]; then
  echo "Usage: scripts/generate-manifest.sh --base-url <release asset base url>" >&2
  exit 1
fi

version="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' "$ROOT_DIR/Directory.Build.props" | head -n1)"
guid="$(sed -n 's/^guid: "\(.*\)"/\1/p' "$ROOT_DIR/build.yaml" | head -n1)"
target_abi="$(sed -n 's/^targetAbi: "\(.*\)"/\1/p' "$ROOT_DIR/build.yaml" | head -n1)"
zip_name="seerr-discover_${version}.zip"
zip_path="$DIST_DIR/$zip_name"
checksum_path="${zip_path}.sha256"
manifest_path="$DIST_DIR/manifest.json"
release_changelog="Fix Jellyfin repository manifest checksums and prevent mobile clients from being trapped after opening YouTube trailer links."

if [ ! -f "$zip_path" ] || [ ! -f "$checksum_path" ]; then
  echo "Missing $zip_name or checksum. Run scripts/package-plugin.sh first." >&2
  exit 1
fi

if command -v md5sum >/dev/null 2>&1; then
  checksum="$(md5sum "$zip_path" | awk '{print toupper($1)}')"
elif command -v md5 >/dev/null 2>&1; then
  checksum="$(md5 -q "$zip_path" | tr '[:lower:]' '[:upper:]')"
else
  echo "md5sum or md5 is required to generate a Jellyfin repository manifest." >&2
  exit 1
fi
timestamp="$(date -u +%Y-%m-%dT%H:%M:%S.0000000Z)"
source_url="${base_url%/}/$zip_name"

cat >"$manifest_path" <<MANIFEST
[
  {
    "category": "General",
    "description": "Native Jellyfin Discover page backed by Seerr API proxy endpoints.",
    "guid": "$guid",
    "name": "Seerr Discover",
    "overview": "Native Seerr Discover page",
    "owner": "omgwtfwow",
    "versions": [
      {
        "checksum": "$checksum",
        "changelog": "$release_changelog",
        "sourceUrl": "$source_url",
        "targetAbi": "$target_abi",
        "timestamp": "$timestamp",
        "version": "$version"
      }
    ]
  }
]
MANIFEST

echo "Created $manifest_path"
