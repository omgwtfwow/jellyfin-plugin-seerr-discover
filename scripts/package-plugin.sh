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

yaml_value() {
  local key="$1"
  awk -v key="$key" '
    $0 ~ "^" key ": " {
      value = $0
      sub("^" key ": *", "", value)
      gsub(/^"|"$/, "", value)
      if (value == ">") {
        folded = 1
        next
      }
      print value
      exit
    }
    folded {
      if ($0 ~ /^[A-Za-z][A-Za-z0-9_-]*:/ || $0 ~ /^---/) {
        exit
      }
      line = $0
      sub(/^  /, "", line)
      if (line != "") {
        if (out != "") {
          out = out " "
        }
        out = out line
      }
    }
    END {
      if (folded && out != "") {
        print out
      }
    }
  ' "$ROOT_DIR/build.yaml"
}

json_escape() {
  python3 -c 'import json, sys; print(json.dumps(sys.stdin.read().strip())[1:-1])'
}

name="$(yaml_value name)"
category="$(yaml_value category)"
overview="$(yaml_value overview)"
description="$(yaml_value description)"
owner="$(yaml_value owner)"
release_changelog="$(yaml_value changelog)"

if [ -z "$version" ] || [ -z "$guid" ] || [ -z "$target_abi" ] || [ -z "$name" ] || [ -z "$category" ] || [ -z "$overview" ] || [ -z "$description" ] || [ -z "$owner" ] || [ -z "$release_changelog" ]; then
  echo "Unable to read release metadata." >&2
  exit 1
fi

command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required." >&2
  exit 1
}

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
name_json="$(printf '%s' "$name" | json_escape)"
category_json="$(printf '%s' "$category" | json_escape)"
overview_json="$(printf '%s' "$overview" | json_escape)"
description_json="$(printf '%s' "$description" | json_escape)"
owner_json="$(printf '%s' "$owner" | json_escape)"
release_changelog_json="$(printf '%s' "$release_changelog" | json_escape)"
cat >"$STAGING_DIR/meta.json" <<META
{
  "category": "$category_json",
  "changelog": "$release_changelog_json",
  "description": "$description_json",
  "guid": "$guid",
  "name": "$name_json",
  "overview": "$overview_json",
  "owner": "$owner_json",
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
