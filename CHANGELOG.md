# Changelog

## 0.3.0.0

- Promote Seerr Discover as the stable third-party Jellyfin plugin release line.
- Redesign the detail modal with a stable cinematic hero, fixed poster slot,
  clearer action hierarchy, visible close control, cast/crew avatars, and
  responsive desktop/mobile details layout.
- Keep Jellyfin's native no-results message visible and place requestable Seerr
  search results underneath it.
- Smooth the Discover tab first-load experience with Jellyfin's native loading
  overlay.
- Remove the duplicate inline loading notice when the native Jellyfin loader is
  active.
- Promote Discover rail titles to H2 headings for clearer page hierarchy.
- Keep raw Discover controls on the inherited Jellyfin font instead of browser
  button defaults.
- Expose Jellyfin-native section, card, and modal class hooks so Custom CSS
  themes can style Discover more like native Jellyfin surfaces.
- Keep mobile detail modal metadata before related rails so Details and Tags
  do not fall beneath recommendations.
- Keep Cast and Crew side by side in the phone-width detail modal with compact
  ellipsized people rows.
- Render Details facts in two columns on phone-width detail modals while
  keeping Tags below them.
- Add per-rail vertical poster or horizontal thumbnail artwork controls, plus
  saved rail ordering for Discover and detail page rails.
- Refresh README screenshots around the core Discover rails, native search,
  detail modal, and mobile layout flows.
- Remove redundant request-state screenshots from the release docs.

## 0.2.11.0

- Fix Discover tab layout jumps after scrolling down and back up by replacing
  scroll-sensitive overlap measurement with stable responsive spacing.

## 0.2.10.0

- Fix native Jellyfin search row flashing by ignoring unchanged active queries
  during repeated DOM observer mount attempts.
- Keep existing Seerr search results visible while refreshing the same query.

## 0.2.9.0

- Make the Discover tab rails-only by removing the tab-local search form,
  search result state, and page title.
- Update setup and troubleshooting docs to direct Seerr search through
  Jellyfin's native search page.

## 0.2.8.0

- Add optional Jellyfin native search integration that shows requestable Seerr
  movie and show results from the native Jellyfin search page.
- Add a non-secret client configuration endpoint and admin toggle for the
  native search integration.

## 0.2.7.0

- Remove the Discover page subtitle.
- Use overlap-based spacing against the rendered Custom Tabs navigation so
  Discover clears client headers without adding large blank gaps.

## 0.2.6.0

- Rework public documentation for third-party Jellyfin repository distribution.
- Add companion plugin setup and troubleshooting docs.
- Improve Discover tab safe-area spacing for Jellyfin Desktop and mobile webview clients.

## 0.2.5.0

- Treat TMDB-matched Jellyfin library items as available even when Seerr still reports a requested/processing status.
- Split card type and availability into separate borderless badges.

## 0.2.4.0

- Hide watched Jellyfin items from Discover/search lists when they match by TMDB ID and `UserData.Played` is true.
- Render card years inline beside titles and subtly color available/requested badges with Jellyfin theme variables.

## 0.2.3.0

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
