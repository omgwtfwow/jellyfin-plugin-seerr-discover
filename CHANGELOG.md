# Changelog

## 0.2.3.0 - Unreleased

- Replace persistent request banners with auto-dismissing toasts for async request start, success, and failure feedback.

## 0.2.2.0

- Fix Jellyfin repository install/update checksums by publishing an MD5 checksum in `manifest.json` while keeping the SHA-256 sidecar file for release verification.

## 0.2.1.0

- Prevent mobile clients from being trapped after opening YouTube trailer links by copying trailer URLs on mobile/touch/narrow contexts instead of navigating away from Jellyfin.

## 0.2.0.0

- Prepare standalone public release packaging.
- Add redacted admin configuration endpoints.
- Preserve stored Seerr API keys when the config page key field is left blank.
- Add an explicit stored-key clear control.
- Redact unsafe upstream Seerr error payloads.
- Add release zip and manifest generation scripts.
- Add CI and release workflows.

## 0.1.12.0

- Make Discover UI inherit Jellyfin theme variables.
- Add visual QA coverage for current and simulated theme styles.

## 0.1.7.0

- Add request status polish, trailers, Watch Now, and Open Details behavior.
- Improve request error handling.

## 0.1.0.0

- Initial Seerr Discover server plugin and Jellyfin Web asset.
