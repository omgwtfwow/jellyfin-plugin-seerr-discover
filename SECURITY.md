# Security Policy

## Supported Versions

Only the latest release candidate is supported while the plugin is pre-1.0.

## Reporting a Vulnerability

Please open a private vulnerability report on GitHub or contact the repository owner directly. Do not publish Seerr API keys, Jellyfin API tokens, server URLs, or screenshots containing secrets in public issues.

## Security Model

- Browser JavaScript served from `/SeerrDiscover/assets/*` is public, auditable client code. It is not a secret and should never contain Seerr API keys, Jellyfin tokens, or stored credentials.
- Seerr API keys are stored in Jellyfin plugin configuration and used only server-side.
- Browser JavaScript calls Jellyfin-authenticated plugin proxy endpoints for Seerr data. Anonymous access to a JavaScript asset is not anonymous access to Seerr data.
- Browser layout code may read Jellyfin Web/client CSS and header dimensions so the Discover tab aligns with desktop and mobile clients. That presentation logic must not receive Seerr credentials or Jellyfin tokens.
- Request creation uses the mapped Jellyfin user by default.
- The config page exposes only whether a Seerr API key is configured, not the stored value.

If you find a path where browser JavaScript receives `X-Api-Key` or the stored Seerr API key value, treat it as a security bug.
