# Troubleshooting

## Seerr Discover Does Not Appear in the Plugin Catalog

- Confirm the repository URL is exactly:

  ```text
  https://omgwtfwow.github.io/jellyfin-plugin-seerr-discover/manifest.json
  ```

- Confirm your Jellyfin version matches the plugin `targetAbi`. Current releases target Jellyfin `10.11.x` with `targetAbi: 10.11.10.0`.
- Restart Jellyfin after adding a repository.
- If GitHub Pages is unavailable, use the latest release `manifest.json` asset as a temporary fallback.

## Plugin Installs but the Discover Tab Is Missing

- Confirm Custom Tabs is installed and active.
- Confirm a Custom Tabs entry named `Discover` exists.
- Confirm the tab content includes:

  ```html
  <div class="sections"><div id="seerrDiscoverRoot"></div></div>
  ```

- Confirm JavaScript Injector is installed and active.
- Confirm the Seerr Discover loader script is authenticated and enabled.

## Discover Tab Is Blank

- Check that the loader points to the installed version:

  ```js
  script.src = '/SeerrDiscover/assets/discover.js?v=<installed-version>';
  ```

- Open the asset URL in the browser or network panel. It should return `200` and `text/javascript`.
- Hard-refresh Jellyfin Web. In Jellyfin Desktop or mobile app webviews, fully close and reopen the client.
- Confirm the Jellyfin user is authenticated. The plugin endpoints require Jellyfin auth.
- The Discover tab is rails-only. Use Jellyfin's native search page for search results.

## Seerr Results Do Not Appear in Jellyfin Search

- Confirm `Show Seerr results in Jellyfin search` is enabled in Dashboard > Plugins > Seerr Discover.
- Confirm the JavaScript Injector loader is authenticated, enabled, and points to the installed plugin version.
- Search from Jellyfin's native search page, not from the Discover tab.
- Check the browser network panel for successful `/SeerrDiscover/client-config` and `/SeerrDiscover/search` responses.
- If Jellyfin already has the matching movie or series by TMDB id, Seerr Discover hides that duplicate from the Seerr row.

## Requests Are Disabled or Show Not Linked

- Import or link Jellyfin users in Seerr.
- Keep `Require mapped Seerr users` enabled unless you intentionally want admin-style fallback behavior.
- Verify `/SeerrDiscover/me` as the current Jellyfin user returns a mapped Seerr user.

## Available Items Still Show Requested

Seerr, Radarr/Sonarr, and Jellyfin can update at different times. Seerr Discover tries to treat TMDB-matched Jellyfin library items as available, but stale upstream state can still appear briefly.

- Refresh the Discover page after Jellyfin finishes scanning.
- Confirm the item has TMDB metadata in Jellyfin.
- Confirm Seerr has refreshed availability for the same TMDB id.

## Content Is Too Close to Client Edges

The Discover page is injected into Jellyfin Web through Custom Tabs. Browser, desktop, and mobile clients can host Jellyfin Web with slightly different outer wrappers.

- Confirm the installed asset includes the latest spacing fix.
- Update the JavaScript Injector query string after upgrading.
- Hard-refresh or restart the client app.
- If the issue remains, report the client type, viewport size, Jellyfin version, and a screenshot.

## Trailer Opens but Mobile Navigation Is Awkward

Trailer links open YouTube URLs from inside the Jellyfin Web client. Some mobile webviews hand off to YouTube or an external browser in ways Seerr Discover cannot fully control.

- Use the system back control if available.
- If the mobile app cannot return cleanly, close and reopen Jellyfin.
- Report the exact client and platform so the trailer behavior can be adjusted or made optional later.

## Browser Traffic Shows the Seerr API Key

This should not happen. Browser JavaScript should call `/SeerrDiscover/*` endpoints for Seerr traffic with Jellyfin auth. Local Jellyfin API requests, such as `/Items`, can appear for library availability matching, but they should not contain the Seerr API key.

- Remove screenshots/logs that include secrets before filing an issue.
- Disable the plugin until the exposure is understood.
- File a security-sensitive issue with reproduction steps.
