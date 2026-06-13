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
image_url="$(yaml_value imageUrl)"
release_changelog="$(yaml_value changelog)"

if [ -z "$version" ] || [ -z "$guid" ] || [ -z "$target_abi" ] || [ -z "$name" ] || [ -z "$category" ] || [ -z "$overview" ] || [ -z "$description" ] || [ -z "$owner" ] || [ -z "$release_changelog" ]; then
  echo "Unable to read release metadata." >&2
  exit 1
fi

command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required." >&2
  exit 1
}

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
name_json="$(printf '%s' "$name" | json_escape)"
category_json="$(printf '%s' "$category" | json_escape)"
overview_json="$(printf '%s' "$overview" | json_escape)"
description_json="$(printf '%s' "$description" | json_escape)"
owner_json="$(printf '%s' "$owner" | json_escape)"
release_changelog_json="$(printf '%s' "$release_changelog" | json_escape)"
image_url_line=""
if [ -n "$image_url" ]; then
  image_url_json="$(printf '%s' "$image_url" | json_escape)"
  image_url_line="    \"imageUrl\": \"$image_url_json\","
fi

cat >"$manifest_path" <<MANIFEST
[
  {
    "category": "$category_json",
    "description": "$description_json",
    "guid": "$guid",
$image_url_line
    "name": "$name_json",
    "overview": "$overview_json",
    "owner": "$owner_json",
    "versions": [
      {
        "checksum": "$checksum",
        "changelog": "$release_changelog_json",
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
