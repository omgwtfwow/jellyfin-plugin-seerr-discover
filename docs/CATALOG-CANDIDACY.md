# Jellyfin Catalog Candidacy

The long-term goal is official Jellyfin plugin catalog submission. This document tracks the constraints that should be reviewed before submission.

## Current Architecture

- Jellyfin server plugin exposes authenticated Seerr proxy endpoints.
- The Seerr API key is never sent to browser JavaScript.
- The Jellyfin Web UI is provided by an embedded plugin asset loaded into a Custom Tabs page.
- Custom Tabs and JavaScript Injector are long-term dependencies for v1.

## Catalog Review Topics

- Whether a plugin with required companion UI-injection plugins is acceptable in the official catalog.
- Whether the plugin-served JavaScript asset and Custom Tabs mount point satisfy Jellyfin Web maintainability expectations.
- Whether `RequiresElevation` admin config endpoints are sufficient for secret configuration.
- Whether install instructions should require a self-hosted repository first before official listing.

See [CATALOG-FEASIBILITY-DISCUSSION.md](CATALOG-FEASIBILITY-DISCUSSION.md) for the maintainer/community discussion draft.

## Before Submission

- Publish at least one public release candidate.
- Verify manual zip install and self-hosted repository install on a clean Jellyfin `10.11.x` container.
- Confirm no browser request contains the Seerr API key.
- Capture screenshots for Discover, search, movie details, TV details, trailer dropdown, and config page.
- Document known dependency setup for Custom Tabs, JavaScript Injector, and File Transformation.
- Open a Jellyfin community or maintainer feasibility discussion and link it from the release issue.
