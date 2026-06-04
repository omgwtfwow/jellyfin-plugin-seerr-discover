# Catalog Feasibility Discussion Draft

This is a draft for user approval before posting to Jellyfin maintainers or community channels.

## Draft Post

Title:

```text
Catalog feasibility for a Seerr-backed Discover plugin with companion UI injection plugins
```

Body:

```markdown
Hi Jellyfin maintainers/community,

I am preparing `Jellyfin.Plugin.SeerrDiscover` for broader release and would like early guidance before treating it as an official plugin catalog candidate.

The plugin is a Jellyfin Server plugin targeting Jellyfin 10.11.x. It provides authenticated server-side proxy endpoints to a Seerr instance for discover feeds, search, media details, user mapping, and request creation. The browser never receives the Seerr API key; Jellyfin Web calls only `/SeerrDiscover/*` endpoints with Jellyfin authentication, and the server plugin sends the upstream Seerr API key from server-side code.

The open compatibility question is the end-user UI surface. Jellyfin Server plugins do not appear to provide a stable server-plugin-only way to add a rich end-user Discover page to Jellyfin Web. The current UI is therefore a plugin-served JavaScript asset mounted into a dedicated Custom Tabs page, with JavaScript Injector loading the asset from `/SeerrDiscover/assets/discover.js`. This avoids an iframe, avoids a Jellyfin Web fork, and avoids patching Seerr, but it does mean the plugin has documented companion dependencies:

- Custom Tabs for the `Discover` tab mount point.
- JavaScript Injector for loading the plugin-served UI asset.
- File Transformation only if required by a user's JavaScript Injector setup.

Before I invest in a formal catalog submission package, I would appreciate guidance on:

1. Is this dependency model acceptable for an official Jellyfin plugin catalog candidate, assuming the README and install docs make the companion plugin requirements explicit?
2. If not, is a self-hosted plugin repository the more appropriate long-term distribution path for this type of integration?
3. Is there a preferred alternative for a server plugin to expose a rich end-user page in Jellyfin Web without maintaining a Jellyfin Web fork?
4. Are there specific security or review expectations for plugin-served browser assets that call authenticated plugin controller endpoints?

Current safeguards:

- Seerr API key is server-side only and is not rendered into the admin config page.
- Config responses expose only `SeerrApiKeyConfigured=true/false`.
- Request creation uses mapped Jellyfin users by default and does not silently fall back to admin.
- Unauthenticated plugin endpoint calls return `401`.
- The Discover UI is theme-aware and uses Jellyfin CSS variables where practical.
- Manual zip install and self-hosted repository install are being tested on clean Jellyfin 10.11.x instances before stable release.

This is not a formal catalog submission yet; I am looking for feasibility feedback on the UI/dependency model first.
```

## Evidence To Attach Before Posting

- Public repository link.
- Release candidate link for `v0.2.0.0`.
- Self-hosted plugin repository URL.
- Screenshots for Discover landing, movie modal, TV modal, trailer dropdown, and narrow viewport.
- Security QA notes showing browser traffic does not include the Seerr API key.
- Clean install notes for zip and repository install paths.
