(function () {
  'use strict';

  const rootSelector = '#seerrDiscoverRoot';
  const styleId = 'seerr-discover-style';
  const discoverLoadingKey = 'discover';
  const discoverLoadingModeParam = 'seerrDiscoverLoading';
  const discoverLoadingModeStorageKey = 'seerrDiscoverLoadingMode';
  const defaultDiscoverLoadingMode = 'native';
  const defaultRails = [
    { id: 'trending-movies', title: 'Trending Movies', feed: 'trending-movies' },
    { id: 'trending-tv', title: 'Trending TV', feed: 'trending-tv' },
    { id: 'movies', title: 'Popular Movies', feed: 'movies' },
    { id: 'tv', title: 'Popular TV', feed: 'tv' },
    { id: 'upcoming', title: 'Upcoming Movies', feed: 'upcoming' },
    { id: 'upcoming-tv', title: 'Upcoming TV', feed: 'upcoming-tv' },
  ];
  const state = {
    mountedRoot: null,
    clientConfig: null,
    clientConfigPromise: null,
    me: null,
    details: null,
    loading: new Set(),
    error: '',
    toasts: [],
    jellyfinItemCache: new Map(),
    autoplayKey: '',
  };
  let nextToastId = 1;
  let spacingFrame = 0;
  const nativeSearch = {
    input: null,
    debounceId: 0,
    requestId: 0,
    enabled: null,
    enabledPromise: null,
    lastQuery: '',
    pendingQuery: '',
    loadingQuery: '',
    renderedQuery: '',
    repositionObserver: null,
    repositionTimeout: 0,
  };

  let rails = defaultRails;

  function normalizeDiscoverLoadingMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'native' || normalized === 'skeleton' ? normalized : '';
  }

  function discoverLoadingModeFromUrl() {
    const searchMode = safeSearchParam(window.location.search, discoverLoadingModeParam);
    if (searchMode) return searchMode;

    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    return queryIndex >= 0 ? safeSearchParam(hash.slice(queryIndex + 1), discoverLoadingModeParam) : '';
  }

  function safeSearchParam(value, key) {
    try {
      return normalizeDiscoverLoadingMode(new URLSearchParams(value).get(key));
    } catch {
      return '';
    }
  }

  function discoverLoadingMode() {
    const urlMode = discoverLoadingModeFromUrl();
    if (urlMode) {
      try {
        window.localStorage?.setItem(discoverLoadingModeStorageKey, urlMode);
      } catch {
        // Ignore storage failures; URL override still applies for this load.
      }
      return urlMode;
    }

    try {
      return normalizeDiscoverLoadingMode(window.localStorage?.getItem(discoverLoadingModeStorageKey)) || defaultDiscoverLoadingMode;
    } catch {
      return defaultDiscoverLoadingMode;
    }
  }

  function currentDashboard() {
    if (window.Dashboard) return window.Dashboard;
    if (typeof Dashboard !== 'undefined') return Dashboard;
    return null;
  }

  function apiUrl(path) {
    if (window.ApiClient && typeof window.ApiClient.getUrl === 'function') {
      return window.ApiClient.getUrl(path.replace(/^\//, ''));
    }
    return `/${path.replace(/^\//, '')}`;
  }

  function apiFetch(path, options) {
    if (window.ApiClient && typeof window.ApiClient.fetch === 'function') {
      return window.ApiClient.fetch({
        url: apiUrl(path),
        type: options?.method || 'GET',
        data: options?.body,
        contentType: options?.body ? 'application/json' : undefined,
        dataType: 'json',
        headers: { accept: 'application/json' },
      }).catch((error) => normalizeApiError(error));
    }

    return fetch(apiUrl(path), {
      method: options?.method || 'GET',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: options?.body,
    }).then((response) => {
      if (!response.ok) {
        return normalizeApiError(response);
      }
      return response.json();
    });
  }

  function jellyfinFetch(path) {
    if (window.ApiClient && typeof window.ApiClient.fetch === 'function') {
      return window.ApiClient.fetch({
        url: apiUrl(path),
        type: 'GET',
        dataType: 'json',
        headers: { accept: 'application/json' },
      }).catch((error) => normalizeApiError(error));
    }

    return fetch(apiUrl(path), {
      headers: { accept: 'application/json' },
    }).then((response) => {
      if (!response.ok) {
        return normalizeApiError(response);
      }
      return response.json();
    });
  }

  function normalizeApiError(error) {
    if (error?.responseJSON) {
      return Promise.reject(new Error(errorMessageFromPayload(error.responseJSON, httpFallback(error))));
    }

    if (typeof error?.responseText === 'string') {
      return Promise.reject(new Error(errorMessageFromText(error.responseText, httpFallback(error))));
    }

    if (typeof error?.json === 'function') {
      return error.json()
        .then(
          (payload) => Promise.reject(new Error(errorMessageFromPayload(payload, httpFallback(error)))),
          () => Promise.reject(new Error(httpFallback(error)))
        );
    }

    if (typeof error?.text === 'function') {
      return error.text()
        .then(
          (text) => Promise.reject(new Error(errorMessageFromText(text, httpFallback(error)))),
          () => Promise.reject(new Error(httpFallback(error)))
        );
    }

    if (error instanceof Error) {
      return Promise.reject(error);
    }

    return Promise.reject(new Error(error ? String(error) : 'Request failed'));
  }

  function errorMessageFromText(text, fallback) {
    if (!text) return fallback;
    try {
      return errorMessageFromPayload(JSON.parse(text), fallback);
    } catch {
      return text.slice(0, 500);
    }
  }

  function errorMessageFromPayload(payload, fallback) {
    if (!payload) return fallback;
    if (typeof payload === 'string') return payload;
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
    return fallback;
  }

  function httpFallback(error) {
    const status = error?.status || error?.statusCode;
    return status ? `HTTP ${status}` : 'Request failed';
  }

  function tmdbImage(path, size) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `https://image.tmdb.org/t/p/${size || 'w780'}${path}`;
  }

  function tmdbSrcSet(path, sizes) {
    if (!path || /^https?:\/\//i.test(path)) return '';
    return sizes.map((size) => `${tmdbImage(path, size)} ${size.replace(/^w/, '')}w`).join(', ');
  }

  function mediaTitle(item) {
    return item.title || item.name || item.originalTitle || item.originalName || 'Untitled';
  }

  function mediaDate(item) {
    return item.releaseDate || item.firstAirDate || '';
  }

  function mediaType(item) {
    return (item.mediaType || (item.name ? 'tv' : 'movie')).toLowerCase();
  }

  function isSupportedMedia(item) {
    const type = mediaType(item);
    return type === 'movie' || type === 'tv';
  }

  function supportedResults(items) {
    return (items || []).filter(isSupportedMedia);
  }

  function discoverDedupeKey(item) {
    const tmdbId = tmdbIdFor(item);
    if (tmdbId) return `${mediaType(item)}:${tmdbId}`;
    const title = mediaTitle(item).trim().toLowerCase();
    const year = (mediaDate(item) || '').slice(0, 4);
    return title ? `${mediaType(item)}:${title}:${year}` : '';
  }

  function dedupeRailData(activeRails, railData) {
    const dedupeSourceByRail = {
      movies: 'trending-movies',
      tv: 'trending-tv',
    };
    const activeRailIds = new Set(activeRails.map((rail) => rail.id));
    const sourceKeys = new Map();

    Object.values(dedupeSourceByRail).forEach((sourceRailId) => {
      if (!activeRailIds.has(sourceRailId) || sourceKeys.has(sourceRailId)) return;
      sourceKeys.set(sourceRailId, new Set(supportedResults(railData?.[sourceRailId] || [])
        .map(discoverDedupeKey)
        .filter(Boolean)));
    });

    return activeRails.reduce((deduped, rail) => {
      const sourceRailId = dedupeSourceByRail[rail.id];
      const blockedKeys = sourceRailId ? sourceKeys.get(sourceRailId) : null;
      deduped[rail.id] = supportedResults(railData?.[rail.id] || []).filter((item) => {
        const key = discoverDedupeKey(item);
        return !key || !blockedKeys?.has(key);
      });
      return deduped;
    }, {});
  }

  function statusLabel(item) {
    if (isJellyfinAvailable(item)) return 'Available';
    const status = item.mediaInfo && item.mediaInfo.status;
    if (status === 5) return 'Available';
    if (status === 4) return 'Partial';
    if (status === 3 || status === 2) return 'Requested';
    const requests = (item.mediaInfo && item.mediaInfo.requests) || [];
    if (requests.length) return 'Requested';
    return mediaType(item) === 'tv' ? 'Series' : 'Movie';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function ensureStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .seerr-discover {
        --seerr-bg: var(--jf-palette-background-default, #101010);
        --seerr-bg-channel: var(--jf-palette-background-defaultChannel, 16 16 16);
        --seerr-surface: var(--jf-palette-background-paper, #202020);
        --seerr-surface-channel: var(--jf-palette-background-paperChannel, 32 32 32);
        --seerr-text: var(--jf-palette-text-primary, #fff);
        --seerr-text-channel: var(--jf-palette-text-primaryChannel, 255 255 255);
        --seerr-muted: var(--jf-palette-text-secondary, rgba(255,255,255,0.7));
        --seerr-disabled: var(--jf-palette-text-disabled, rgba(255,255,255,0.5));
        --seerr-primary: var(--jf-palette-primary-main, #00a4dc);
        --seerr-primary-channel: var(--jf-palette-primary-mainChannel, 0 164 220);
        --seerr-primary-contrast: var(--jf-palette-primary-contrastText, rgba(0,0,0,0.87));
        --seerr-input-bg: var(--jf-palette-FilledInput-bg, rgb(var(--seerr-text-channel) / 0.09));
        --seerr-disabled-bg: var(--jf-palette-action-disabledBackground, rgb(var(--seerr-text-channel) / 0.12));
        --seerr-border: rgb(var(--seerr-text-channel) / 0.16);
        --seerr-border-soft: rgb(var(--seerr-text-channel) / 0.1);
        --seerr-hover: rgb(var(--seerr-text-channel) / 0.08);
        --seerr-card-placeholder: linear-gradient(145deg, rgb(var(--seerr-primary-channel) / 0.24), rgb(var(--seerr-surface-channel) / 0.88));
        display: flex;
        flex-direction: column;
        gap: 1.4rem;
        box-sizing: border-box;
        min-width: 0;
        margin-top: var(--seerr-content-overlap-offset, 0);
        padding: 0 clamp(0.85rem, 2.6vw, 2.25rem) clamp(2rem, 4vh, 3rem);
        color: var(--seerr-text);
      }
      .seerr-native-search,
      .seerr-modal {
        --seerr-bg: var(--jf-palette-background-default, #101010);
        --seerr-bg-channel: var(--jf-palette-background-defaultChannel, 16 16 16);
        --seerr-surface: var(--jf-palette-background-paper, #202020);
        --seerr-surface-channel: var(--jf-palette-background-paperChannel, 32 32 32);
        --seerr-text: var(--jf-palette-text-primary, #fff);
        --seerr-text-channel: var(--jf-palette-text-primaryChannel, 255 255 255);
        --seerr-muted: var(--jf-palette-text-secondary, rgba(255,255,255,0.7));
        --seerr-disabled: var(--jf-palette-text-disabled, rgba(255,255,255,0.5));
        --seerr-primary: var(--jf-palette-primary-main, #00a4dc);
        --seerr-primary-channel: var(--jf-palette-primary-mainChannel, 0 164 220);
        --seerr-primary-contrast: var(--jf-palette-primary-contrastText, rgba(0,0,0,0.87));
        --seerr-input-bg: var(--jf-palette-FilledInput-bg, rgb(var(--seerr-text-channel) / 0.09));
        --seerr-disabled-bg: var(--jf-palette-action-disabledBackground, rgb(var(--seerr-text-channel) / 0.12));
        --seerr-border: rgb(var(--seerr-text-channel) / 0.16);
        --seerr-border-soft: rgb(var(--seerr-text-channel) / 0.1);
        --seerr-hover: rgb(var(--seerr-text-channel) / 0.08);
        --seerr-card-placeholder: linear-gradient(145deg, rgb(var(--seerr-primary-channel) / 0.24), rgb(var(--seerr-surface-channel) / 0.88));
        color: var(--seerr-text);
      }
      .seerr-native-search .seerr-discover__scroller {
        padding-top: 0.15rem;
      }
      .seerr-discover-tab-content {
        --seerr-tab-top-offset: calc(clamp(5.9rem, 8.8vh, 7.2rem) + env(safe-area-inset-top));
        box-sizing: border-box;
        min-height: 100%;
        padding:
          var(--seerr-tab-top-offset)
          max(clamp(0.75rem, 1.5vw, 1.25rem), env(safe-area-inset-right))
          calc(clamp(1.6rem, 4vh, 3rem) + env(safe-area-inset-bottom))
          max(clamp(0.75rem, 1.5vw, 1.25rem), env(safe-area-inset-left));
      }
      .seerr-discover-tab-content > .sections {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        width: 100%;
      }
      .seerr-modal {
        --seerr-bg: var(--jf-palette-background-default, #101010);
        --seerr-bg-channel: var(--jf-palette-background-defaultChannel, 16 16 16);
        --seerr-surface: var(--jf-palette-background-paper, #202020);
        --seerr-surface-channel: var(--jf-palette-background-paperChannel, 32 32 32);
        --seerr-text: var(--jf-palette-text-primary, #fff);
        --seerr-text-channel: var(--jf-palette-text-primaryChannel, 255 255 255);
        --seerr-muted: var(--jf-palette-text-secondary, rgba(255,255,255,0.7));
        --seerr-disabled: var(--jf-palette-text-disabled, rgba(255,255,255,0.5));
        --seerr-primary: var(--jf-palette-primary-main, #00a4dc);
        --seerr-primary-channel: var(--jf-palette-primary-mainChannel, 0 164 220);
        --seerr-primary-contrast: var(--jf-palette-primary-contrastText, rgba(0,0,0,0.87));
        --seerr-input-bg: var(--jf-palette-FilledInput-bg, rgb(var(--seerr-text-channel) / 0.09));
        --seerr-disabled-bg: var(--jf-palette-action-disabledBackground, rgb(var(--seerr-text-channel) / 0.12));
        --seerr-border: rgb(var(--seerr-text-channel) / 0.16);
        --seerr-border-soft: rgb(var(--seerr-text-channel) / 0.1);
        --seerr-hover: rgb(var(--seerr-text-channel) / 0.08);
      }
      .seerr-discover__button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        box-sizing: border-box;
        min-height: 2.55rem;
        border: 0;
        border-radius: 0.45rem;
        margin: 0;
        padding: 0 0.85rem;
        background: var(--seerr-primary);
        color: var(--seerr-primary-contrast);
        font: inherit;
        font-weight: 620;
        text-transform: none;
        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;
      }
      .seerr-discover__button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        background: var(--seerr-disabled-bg);
        color: var(--seerr-disabled);
      }
      .seerr-discover__button--success,
      .seerr-discover__button--success:disabled {
        border: 1px solid var(--jf-palette-success-main, var(--seerr-primary));
        background: var(--jf-palette-Alert-successStandardBg, rgb(76 175 80 / 0.18));
        color: var(--jf-palette-Alert-successColor, var(--seerr-text));
        opacity: 1;
      }
      .seerr-discover__button--success:disabled {
        cursor: default;
      }
      .seerr-discover__button--secondary {
        border: 1px solid var(--seerr-border);
        background: var(--seerr-hover);
        color: var(--seerr-text);
      }
      .seerr-discover__button--tertiary {
        border: 1px solid var(--seerr-border-soft);
        background: transparent;
        color: var(--seerr-muted);
      }
      .seerr-discover__button--seerr {
        border: 1px solid var(--seerr-border-soft);
        background: transparent;
        color: var(--seerr-muted);
      }
      .seerr-discover__notice {
        border: 1px solid var(--seerr-border);
        border-radius: 0.5rem;
        padding: 0.75rem 0.9rem;
        background: var(--seerr-hover);
        color: var(--seerr-muted);
      }
      .seerr-discover__notice--success {
        border-color: var(--jf-palette-success-main, var(--seerr-primary));
        background: var(--jf-palette-Alert-successStandardBg, rgb(var(--seerr-primary-channel) / 0.14));
        color: var(--jf-palette-Alert-successColor, var(--seerr-text));
      }
      .seerr-toast-region {
        --seerr-bg: var(--jf-palette-background-default, #101010);
        --seerr-bg-channel: var(--jf-palette-background-defaultChannel, 16 16 16);
        --seerr-surface: var(--jf-palette-background-paper, #202020);
        --seerr-surface-channel: var(--jf-palette-background-paperChannel, 32 32 32);
        --seerr-text: var(--jf-palette-text-primary, #fff);
        --seerr-text-channel: var(--jf-palette-text-primaryChannel, 255 255 255);
        --seerr-muted: var(--jf-palette-text-secondary, rgba(255,255,255,0.7));
        --seerr-primary: var(--jf-palette-primary-main, #00a4dc);
        --seerr-primary-channel: var(--jf-palette-primary-mainChannel, 0 164 220);
        --seerr-border: rgb(var(--seerr-text-channel) / 0.16);
        position: fixed;
        right: max(1rem, env(safe-area-inset-right));
        bottom: max(1rem, env(safe-area-inset-bottom));
        z-index: 130000;
        display: grid;
        width: min(26rem, calc(100vw - 2rem));
        gap: 0.6rem;
        pointer-events: none;
      }
      .seerr-toast {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0.75rem;
        align-items: start;
        border: 1px solid var(--seerr-border);
        border-radius: 0.55rem;
        padding: 0.8rem 0.85rem;
        background: rgb(var(--seerr-surface-channel) / 0.96);
        color: var(--seerr-text);
        box-shadow: 0 0.9rem 2.4rem rgb(var(--seerr-bg-channel) / 0.38);
        pointer-events: auto;
      }
      .seerr-toast--success {
        border-color: var(--jf-palette-success-main, var(--seerr-primary));
        background: var(--jf-palette-Alert-successStandardBg, rgb(var(--seerr-surface-channel) / 0.96));
        color: var(--jf-palette-Alert-successColor, var(--seerr-text));
      }
      .seerr-toast--error {
        border-color: var(--jf-palette-error-main, #f44336);
        background: var(--jf-palette-Alert-errorStandardBg, rgb(var(--seerr-surface-channel) / 0.96));
        color: var(--jf-palette-Alert-errorColor, var(--seerr-text));
      }
      .seerr-toast__message {
        min-width: 0;
        overflow-wrap: anywhere;
        line-height: 1.35;
      }
      .seerr-toast__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.65rem;
        height: 1.65rem;
        border: 0;
        border-radius: 999px;
        margin: -0.25rem -0.25rem 0 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        line-height: 1;
      }
      .seerr-toast__close:hover {
        background: rgb(var(--seerr-text-channel) / 0.08);
      }
      .seerr-discover__rail {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .seerr-discover__rail h3 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 650;
        letter-spacing: 0;
      }
      .seerr-discover__scroller {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(11rem, 13.5rem);
        gap: 0.78rem;
        overflow-x: auto;
        padding: 0.15rem 0 0.7rem;
        scrollbar-width: thin;
      }
      .seerr-discover--loading {
        min-height: clamp(14rem, 32vh, 24rem);
      }
      .seerr-discover__loading-fallback {
        width: fit-content;
        max-width: 100%;
      }
      .seerr-skeleton {
        pointer-events: none;
        user-select: none;
      }
      .seerr-skeleton__title,
      .seerr-skeleton__poster,
      .seerr-skeleton__line {
        border-radius: 0.48rem;
        background: linear-gradient(
          90deg,
          rgb(var(--seerr-text-channel) / 0.08),
          rgb(var(--seerr-text-channel) / 0.16),
          rgb(var(--seerr-text-channel) / 0.08)
        );
        background-size: 220% 100%;
        animation: seerr-skeleton-pulse 1.25s ease-in-out infinite;
      }
      .seerr-skeleton__title {
        width: min(12rem, 52vw);
        height: 1.15rem;
      }
      .seerr-skeleton__card {
        display: grid;
        grid-template-rows: auto minmax(3.2rem, auto);
        gap: 0;
      }
      .seerr-skeleton__poster {
        aspect-ratio: 2 / 3;
        box-shadow: inset 0 0 0 1px var(--seerr-border-soft);
      }
      .seerr-skeleton__meta {
        display: grid;
        gap: 0.38rem;
        min-width: 0;
        padding: 0.55rem 0.1rem 0;
      }
      .seerr-skeleton__line {
        height: 0.8rem;
      }
      .seerr-skeleton__line--short {
        width: 58%;
      }
      @keyframes seerr-skeleton-pulse {
        0% { background-position: 120% 0; }
        100% { background-position: -120% 0; }
      }
      .seerr-card {
        display: grid;
        grid-template-rows: auto minmax(3.2rem, auto);
        border: 0;
        border-radius: 0.48rem;
        padding: 0;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }
      .seerr-card__image {
        position: relative;
        aspect-ratio: 2 / 3;
        overflow: hidden;
        border-radius: 0.48rem;
        isolation: isolate;
        background: linear-gradient(145deg, var(--seerr-hover), var(--seerr-card-placeholder));
        box-shadow: inset 0 0 0 1px var(--seerr-border-soft);
      }
      .seerr-card__image::before {
        content: "";
        position: absolute;
        inset: 0;
        background-image: var(--seerr-artwork);
        background-position: center;
        background-size: cover;
        filter: blur(18px);
        opacity: 0.32;
        transform: scale(1.14);
        z-index: 0;
      }
      .seerr-card__image img {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        background: transparent;
      }
      .seerr-card__image--backdrop::before {
        opacity: 0.58;
      }
      .seerr-card__image--backdrop img {
        background: transparent;
        filter: drop-shadow(0 0.5rem 1.2rem rgb(var(--seerr-bg-channel) / 0.36));
        object-fit: contain;
      }
      .seerr-card__badges {
        position: absolute;
        top: 0.45rem;
        left: 0.45rem;
        right: 0.45rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        align-items: flex-start;
        z-index: 2;
        pointer-events: none;
      }
      .seerr-card__badge {
        max-width: 100%;
        border-radius: 999px;
        padding: 0.22rem 0.45rem;
        background: rgb(var(--seerr-bg-channel) / 0.78);
        color: var(--seerr-text);
        font-size: 0.72rem;
        line-height: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .seerr-card__badge--available {
        background: var(--jf-palette-Alert-successStandardBg, rgb(76 175 80 / 0.18));
        color: var(--jf-palette-Alert-successColor, var(--seerr-text));
      }
      .seerr-card__badge--requested {
        background: var(--jf-palette-Alert-infoStandardBg, rgb(var(--seerr-primary-channel) / 0.18));
        color: var(--jf-palette-Alert-infoColor, var(--seerr-text));
      }
      .seerr-card__meta {
        min-width: 0;
        padding: 0.55rem 0.1rem 0;
      }
      .seerr-card__title {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 2.3em;
        font-size: 0.95rem;
        line-height: 1.15;
      }
      .seerr-card__year {
        color: var(--seerr-disabled);
        font-size: 0.82em;
      }
      .seerr-modal {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        padding: 1.5rem;
        background: rgb(var(--seerr-bg-channel) / 0.66);
      }
      .seerr-modal__panel {
        position: relative;
        width: min(74rem, 96vw);
        max-height: 90vh;
        overflow: auto;
        border-radius: 0.65rem;
        background: var(--seerr-surface);
        color: var(--seerr-text);
        box-shadow: 0 1.6rem 5rem rgb(var(--seerr-bg-channel) / 0.46);
      }
      .seerr-modal__hero {
        position: relative;
        min-height: clamp(23rem, 45vh, 31rem);
        display: flex;
        align-items: flex-end;
        background-position: center;
        background-size: cover;
      }
      .seerr-modal__hero::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, rgb(var(--seerr-bg-channel) / 0.82) 0%, rgb(var(--seerr-bg-channel) / 0.58) 42%, rgb(var(--seerr-bg-channel) / 0.26) 100%),
          linear-gradient(0deg, var(--seerr-surface) 0%, rgb(var(--seerr-surface-channel) / 0.72) 31%, rgb(var(--seerr-surface-channel) / 0.12) 100%);
      }
      .seerr-modal__hero-content {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: clamp(11rem, 18vw, 13.25rem) minmax(0, 1fr);
        gap: clamp(1.1rem, 2vw, 1.55rem);
        align-items: end;
        width: 100%;
        padding: clamp(4rem, 9vh, 5.5rem) clamp(1.1rem, 2.6vw, 1.8rem) clamp(1.25rem, 2.6vh, 1.8rem);
      }
      .seerr-modal__poster {
        position: relative;
        width: 100%;
        aspect-ratio: 2 / 3;
        border-radius: 0.5rem;
        overflow: hidden;
        isolation: isolate;
        background: linear-gradient(145deg, var(--seerr-hover), var(--seerr-card-placeholder));
        box-shadow: 0 0.8rem 1.8rem rgb(var(--seerr-bg-channel) / 0.32);
      }
      .seerr-modal__poster::before {
        content: "";
        position: absolute;
        inset: 0;
        background-image: var(--seerr-artwork);
        background-position: center;
        background-size: cover;
        filter: blur(20px);
        opacity: 0.36;
        transform: scale(1.12);
        z-index: 0;
      }
      .seerr-modal__poster img {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        background: transparent;
      }
      .seerr-modal__poster--backdrop::before {
        opacity: 0.62;
      }
      .seerr-modal__poster--backdrop img {
        background: transparent;
        filter: drop-shadow(0 0.6rem 1.4rem rgb(var(--seerr-bg-channel) / 0.4));
        object-fit: contain;
      }
      .seerr-modal__header {
        min-width: 0;
        display: grid;
        gap: 0.68rem;
        max-width: 48rem;
        padding-bottom: 0.15rem;
      }
      .seerr-modal__eyebrow {
        margin: 0;
        color: rgb(255 255 255 / 0.78);
        font-size: 0.83rem;
        font-weight: 650;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .seerr-modal__header h2 {
        margin: 0;
        display: -webkit-box;
        overflow: hidden;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        max-width: 46rem;
        font-size: clamp(1.75rem, 3vw, 2.65rem);
        line-height: 1.05;
        letter-spacing: 0;
      }
      .seerr-modal__tagline {
        margin: 0;
        color: rgb(255 255 255 / 0.82);
        font-style: italic;
        line-height: 1.35;
      }
      .seerr-modal__overview {
        margin: 0;
        color: var(--seerr-muted);
        font-size: 0.98rem;
        line-height: 1.5;
      }
      .seerr-modal__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
        gap: 0.55rem;
        margin-top: 0.08rem;
      }
      .seerr-modal__actions .seerr-discover__button {
        min-height: 2.85rem;
        padding-inline: 1rem;
        font-weight: 720;
      }
      .seerr-modal__trailer-menu {
        position: relative;
        display: inline-flex;
        max-width: 100%;
      }
      .seerr-modal__trailer-split {
        display: inline-flex;
        align-items: stretch;
        max-width: 100%;
      }
      .seerr-modal__trailer-main {
        border-radius: 0.45rem 0 0 0.45rem;
      }
      .seerr-modal__trailer-toggle {
        width: 2.85rem;
        min-width: 2.85rem;
        border-left: 1px solid var(--seerr-border);
        border-radius: 0 0.45rem 0.45rem 0;
        padding: 0;
      }
      .seerr-modal__play-icon {
        width: 0;
        height: 0;
        border-top: 0.36rem solid transparent;
        border-bottom: 0.36rem solid transparent;
        border-left: 0.56rem solid currentColor;
      }
      .seerr-modal__trailer-caret {
        width: 0.58rem;
        height: 0.58rem;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: rotate(45deg) translate(-0.08rem, -0.08rem);
      }
      .seerr-modal__trailer-menu[data-open="true"] .seerr-modal__trailer-caret {
        transform: rotate(225deg) translate(-0.08rem, -0.08rem);
      }
      .seerr-modal__trailer-list {
        position: absolute;
        top: calc(100% + 0.45rem);
        left: 0;
        z-index: 5;
        display: none;
        min-width: min(22rem, calc(100vw - 3rem));
        overflow: hidden;
        border: 1px solid var(--seerr-border);
        border-radius: 0.5rem;
        background: var(--seerr-surface);
        box-shadow: 0 1rem 2.2rem rgb(var(--seerr-bg-channel) / 0.34);
      }
      .seerr-modal__trailer-menu[data-open="true"] .seerr-modal__trailer-list {
        display: grid;
      }
      .seerr-modal__trailer-link {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 2.8rem;
        padding: 0.72rem 0.9rem;
        color: var(--seerr-text);
        text-decoration: none;
      }
      .seerr-modal__trailer-link + .seerr-modal__trailer-link {
        border-top: 1px solid var(--seerr-border-soft);
      }
      .seerr-modal__trailer-link:hover {
        background: var(--seerr-hover);
      }
      .seerr-modal__trailer-link {
        width: 100%;
        border: 0;
        margin: 0;
        background: transparent;
        text-align: left;
        font: inherit;
        cursor: pointer;
      }
      .seerr-modal__inline-notice {
        display: none;
        margin-top: 0.65rem;
        border: 1px solid var(--jf-palette-success-main, var(--seerr-border));
        border-radius: 0.45rem;
        padding: 0.6rem 0.75rem;
        background: var(--jf-palette-Alert-successStandardBg, rgb(var(--seerr-primary-channel) / 0.14));
        color: var(--jf-palette-Alert-successColor, var(--seerr-text));
        font-size: 0.9rem;
        word-break: break-word;
      }
      .seerr-modal__inline-notice[data-visible="true"] {
        display: block;
      }
      .seerr-modal__headline-meta {
        display: grid;
        gap: 0.55rem;
      }
      .seerr-modal__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.38rem;
      }
      .seerr-modal__chip {
        display: inline-flex;
        align-items: center;
        min-height: 1.65rem;
        border: 1px solid var(--seerr-border);
        border-radius: 999px;
        padding: 0.18rem 0.48rem;
        background: var(--seerr-hover);
        color: var(--seerr-text);
        font-size: 0.76rem;
        line-height: 1.1;
      }
      .seerr-modal__rating {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        color: rgb(255 255 255 / 0.92);
      }
      .seerr-modal__rating strong {
        font-size: 1.05rem;
      }
      .seerr-modal__rating span {
        color: rgb(255 255 255 / 0.68);
        font-size: 0.78rem;
      }
      .seerr-modal__details {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(17rem, 0.38fr);
        gap: clamp(1.2rem, 2vw, 1.8rem);
        padding: clamp(1.1rem, 2.6vw, 1.7rem) clamp(1.1rem, 2.6vw, 1.8rem) clamp(1.25rem, 2.8vw, 1.9rem);
      }
      .seerr-modal__main,
      .seerr-modal__aside {
        min-width: 0;
        display: grid;
        align-content: start;
        gap: 1rem;
      }
      .seerr-modal__aside {
        border-left: 1px solid var(--seerr-border-soft);
        padding-left: clamp(1rem, 2vw, 1.4rem);
      }
      .seerr-modal__facts {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.72rem;
      }
      .seerr-modal__fact-label {
        color: var(--seerr-disabled);
        font-size: 0.75rem;
        font-weight: 650;
        text-transform: uppercase;
      }
      .seerr-modal__fact-value {
        margin-top: 0.12rem;
        color: var(--seerr-text);
        font-size: 0.88rem;
      }
      .seerr-modal__people {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem 1.25rem;
      }
      .seerr-modal__section {
        min-width: 0;
      }
      .seerr-modal__section h3 {
        margin: 0 0 0.45rem;
        font-size: 0.95rem;
        font-weight: 650;
        letter-spacing: 0;
      }
      .seerr-modal__person-list {
        display: grid;
        gap: 0.58rem;
      }
      .seerr-modal__person {
        min-width: 0;
        display: grid;
        grid-template-columns: 2.45rem minmax(0, 1fr);
        gap: 0.62rem;
        align-items: center;
      }
      .seerr-modal__person-avatar {
        width: 2.45rem;
        aspect-ratio: 1;
        border-radius: 0.38rem;
        object-fit: cover;
        background: var(--seerr-hover);
        box-shadow: inset 0 0 0 1px var(--seerr-border-soft);
      }
      .seerr-modal__person-avatar--placeholder {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--seerr-muted);
        font-size: 0.86rem;
        font-weight: 720;
      }
      .seerr-modal__person strong {
        display: block;
        color: var(--seerr-text);
        font-size: 0.9rem;
        line-height: 1.2;
      }
      .seerr-modal__person span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--seerr-muted);
        font-size: 0.78rem;
        line-height: 1.25;
      }
      .seerr-modal__keywords {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .seerr-modal__related {
        margin-top: 1.4rem;
      }
      .seerr-modal__related .seerr-discover__rail {
        margin: 1.1rem 0 0;
      }
      .seerr-modal__related .seerr-discover__rail:first-child {
        margin-top: 0;
      }
      .seerr-modal__related .seerr-discover__scroller {
        padding: 0 0 0.4rem;
      }
      .seerr-modal__close {
        position: absolute;
        top: 0.7rem;
        right: 0.7rem;
        z-index: 3;
        width: 2.25rem;
        height: 2.25rem;
        border: 1px solid rgb(var(--seerr-text-channel) / 0.2);
        border-radius: 50%;
        background: rgb(var(--seerr-bg-channel) / 0.72);
        color: var(--seerr-text);
        font-size: 1.35rem;
        box-shadow: 0 0.45rem 1.2rem rgb(var(--seerr-bg-channel) / 0.4);
        cursor: pointer;
      }
      .seerr-modal__close:hover,
      .seerr-modal__close:focus-visible {
        background: rgb(var(--seerr-text-channel) / 0.14);
        outline: 2px solid rgb(var(--seerr-text-channel) / 0.34);
        outline-offset: 2px;
      }
      @media (max-width: 1199px) {
        .seerr-discover-tab-content {
          --seerr-tab-top-offset: calc(9.25rem + env(safe-area-inset-top));
        }
      }
      @media (max-width: 720px) {
        .seerr-discover-tab-content {
          --seerr-tab-top-offset: calc(clamp(9.25rem, 17vh, 10.75rem) + env(safe-area-inset-top));
          padding:
            var(--seerr-tab-top-offset)
            max(0.5rem, env(safe-area-inset-right))
            calc(1.5rem + env(safe-area-inset-bottom))
            max(0.5rem, env(safe-area-inset-left));
        }
        .seerr-discover { padding-inline: clamp(0.85rem, 3vw, 1.15rem); }
        .seerr-discover__scroller { grid-auto-columns: minmax(9.8rem, 42vw); }
        .seerr-toast-region {
          left: max(1rem, env(safe-area-inset-left));
          right: max(1rem, env(safe-area-inset-right));
          bottom: max(1rem, env(safe-area-inset-bottom));
          width: auto;
        }
        .seerr-modal { padding: 0.7rem; }
        .seerr-modal__panel { max-height: 94vh; }
        .seerr-modal__hero { min-height: auto; }
        .seerr-modal__hero-content {
          grid-template-columns: 1fr;
          align-items: start;
          padding: 3.8rem 1rem 1rem;
        }
        .seerr-modal__poster {
          width: min(42vw, 10rem);
        }
        .seerr-modal__header {
          max-width: none;
        }
        .seerr-modal__header h2 {
          -webkit-line-clamp: unset;
          font-size: 1.55rem;
          line-height: 1.14;
        }
        .seerr-modal__details {
          grid-template-columns: 1fr;
          padding: 1rem;
        }
        .seerr-modal__aside {
          border-left: 0;
          padding: 0;
        }
        .seerr-modal__actions > .seerr-discover__button,
        .seerr-modal__trailer-menu { flex: 1 1 auto; }
        .seerr-modal__trailer-menu,
        .seerr-modal__trailer-split { width: 100%; }
        .seerr-modal__trailer-main { flex: 1 1 auto; }
        .seerr-modal__trailer-list { left: 0; right: 0; min-width: 100%; }
        .seerr-modal__people { grid-template-columns: 1fr; }
      }
      @media (prefers-reduced-motion: reduce) {
        .seerr-skeleton__title,
        .seerr-skeleton__poster,
        .seerr-skeleton__line {
          animation: none;
        }
      }
      .seerr-discover-tab-content[data-seerr-active="true"] {
        display: block !important;
      }
      .seerr-discover-tab-content[data-seerr-active="false"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isHomeRoute() {
    const hash = window.location.hash || '';
    return hash === '' || hash === '#/home' || hash === '#/home.html' || hash.startsWith('#/home?') || hash.startsWith('#/home.html?');
  }

  function isDiscoverTabButton(element) {
    return Boolean(element
      && element.textContent.trim() === 'Discover'
      && (element.id?.startsWith('customTabButton_') || element.closest('.emby-tabs-slider, .emby-tabs')));
  }

  function customTabButtons() {
    return [...document.querySelectorAll('.emby-tabs-slider button, .emby-tabs button, button[id^="customTabButton_"]')];
  }

  function tabButtonForPane(pane) {
    if (!pane?.id?.startsWith('customTab_')) return null;
    return document.getElementById(`customTabButton_${pane.id.replace('customTab_', '')}`);
  }

  function discoverRootPane() {
    const root = document.querySelector(rootSelector);
    return root?.closest('.seerr-discover-tab-content, .tabContent, .pageTabContent') || null;
  }

  function markDiscoverPane() {
    const pane = discoverRootPane();
    if (pane) {
      pane.classList.add('seerr-discover-tab-content');
      pane.dataset.seerrPaneSource = pane.dataset.seerrPaneSource || 'custom-tabs';
    }
    return pane;
  }

  function discoverTabButton() {
    return tabButtonForPane(markDiscoverPane()) || customTabButtons().find(isDiscoverTabButton);
  }

  function isActiveTabButton(element) {
    return Boolean(element && (
      element.classList.contains('emby-tab-button-active')
      || element.classList.contains('active')
      || element.getAttribute('aria-selected') === 'true'
      || document.activeElement === element
    ));
  }

  function discoverTabPane(button) {
    const suffix = button?.id?.replace('customTabButton_', '') || '0';
    return document.getElementById(`customTab_${suffix}`) || document.querySelector('.seerr-discover-tab-content');
  }

  function updateDiscoverSpacing() {
    const button = discoverTabButton();
    const pane = markDiscoverPane() || discoverTabPane(button);
    if (!pane) return;

    const content = pane.querySelector('.seerr-discover');
    if (!content) return;

    content.style.setProperty('--seerr-content-overlap-offset', '0px');
  }

  function scheduleDiscoverSpacing() {
    window.cancelAnimationFrame(spacingFrame);
    spacingFrame = window.requestAnimationFrame(updateDiscoverSpacing);
  }

  function syncCustomTabVisibility() {
    const button = discoverTabButton();
    const pane = discoverTabPane(button);
    if (!pane) return;

    const isActive = isHomeRoute() && isActiveTabButton(button);
    pane.dataset.seerrActive = isActive ? 'true' : 'false';
    pane.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    if (isActive) {
      pane.hidden = false;
      pane.removeAttribute('hidden');
    }
    scheduleDiscoverSpacing();
  }

  function ensureCustomTabRoot() {
    if (document.querySelector(rootSelector)) {
      markDiscoverPane();
      syncCustomTabVisibility();
      return true;
    }
    if (!isHomeRoute()) return false;

    const button = discoverTabButton();
    if (!button || !button.classList.contains('emby-tab-button-active')) return false;

    const page = document.querySelector('#indexPage') || document.querySelector('.homePage');
    if (!page) return false;

    const suffix = button.id.replace('customTabButton_', '') || '0';
    const paneId = `customTab_${suffix}`;
    const paneIndex = button.getAttribute('data-index') || String(Number.parseInt(suffix, 10) + 2);
    const pane = document.getElementById(paneId) || document.createElement('div');
    pane.id = paneId;
    pane.className = 'tabContent pageTabContent seerr-discover-tab-content';
    pane.setAttribute('data-index', paneIndex);
    pane.dataset.seerrPaneSource = 'fallback';
    pane.dataset.seerrActive = 'true';
    pane.setAttribute('aria-hidden', 'false');
    pane.innerHTML = `<div class="sections"><div id="${rootSelector.slice(1)}"></div></div>`;

    if (!pane.parentElement) {
      const favoritesTab = document.querySelector('#favoritesTab');
      if (favoritesTab && favoritesTab.parentElement === page) {
        favoritesTab.insertAdjacentElement('afterend', pane);
      } else {
        page.appendChild(pane);
      }
    }

    syncCustomTabVisibility();
    return true;
  }

  function card(item) {
    const image = item.posterPath ? tmdbImage(item.posterPath, 'w500') : tmdbImage(item.backdropPath, 'w780');
    const srcSet = item.posterPath ? tmdbSrcSet(item.posterPath, ['w342', 'w500', 'w780']) : tmdbSrcSet(item.backdropPath, ['w780', 'w1280']);
    const isBackdropFallback = !item.posterPath && Boolean(item.backdropPath);
    const typeLabel = mediaType(item) === 'tv' ? 'Series' : 'Movie';
    const status = cardStatusLabel(item);
    const year = (mediaDate(item) || '').slice(0, 4);
    const badgeClass = cardBadgeClass(status);
    const imageClass = isBackdropFallback ? ' seerr-card__image--backdrop' : '';
    const imageStyle = image ? ` style="--seerr-artwork:url('${escapeHtml(image)}')"` : '';
    const srcSetAttribute = srcSet ? ` srcset="${escapeHtml(srcSet)}" sizes="(max-width: 720px) 42vw, 13.5rem"` : '';
    return `
      <button class="seerr-card" data-seerr-type="${escapeHtml(mediaType(item))}" data-seerr-id="${escapeHtml(item.id)}">
        <span class="seerr-card__image${imageClass}"${imageStyle}>
          ${image ? `<img loading="lazy" src="${escapeHtml(image)}"${srcSetAttribute} alt="">` : ''}
          <span class="seerr-card__badges">
            <span class="seerr-card__badge">${escapeHtml(typeLabel)}</span>
            ${status ? `<span class="seerr-card__badge ${escapeHtml(badgeClass)}">${escapeHtml(status)}</span>` : ''}
          </span>
        </span>
        <span class="seerr-card__meta">
          <span class="seerr-card__title">
            ${escapeHtml(mediaTitle(item))}${year ? ` <span class="seerr-card__year">${escapeHtml(year)}</span>` : ''}
          </span>
        </span>
      </button>
    `;
  }

  function cardStatusLabel(item) {
    const status = statusLabel(item);
    return status === 'Available' || status === 'Requested' ? status : '';
  }

  function cardBadgeClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'available') return 'seerr-card__badge--available';
    if (normalized === 'requested') return 'seerr-card__badge--requested';
    return '';
  }

  function railTemplate(rail, items) {
    const results = supportedResults(items);
    return `
      <section class="seerr-discover__rail" data-seerr-rail="${escapeHtml(rail.id)}">
        <h3>${escapeHtml(rail.title)}</h3>
        <div class="seerr-discover__scroller">
          ${results.length ? results.map(card).join('') : '<div class="seerr-discover__notice">No results</div>'}
        </div>
      </section>
    `;
  }

  function skeletonRailTemplate(rail) {
    return `
      <section class="seerr-discover__rail seerr-skeleton" data-seerr-skeleton-rail="${escapeHtml(rail.id)}" aria-hidden="true">
        <div class="seerr-skeleton__title"></div>
        <div class="seerr-discover__scroller">
          ${Array.from({ length: 8 }, skeletonCard).join('')}
        </div>
      </section>
    `;
  }

  function skeletonCard() {
    return `
      <div class="seerr-skeleton__card">
        <div class="seerr-skeleton__poster"></div>
        <div class="seerr-skeleton__meta">
          <div class="seerr-skeleton__line"></div>
          <div class="seerr-skeleton__line seerr-skeleton__line--short"></div>
        </div>
      </div>
    `;
  }

  function renderDiscoverLoading(root) {
    const mode = root.__seerrLoadingMode || discoverLoadingMode();
    ensureDiscoverNativeLoading(root);
    const nativeLoaderVisible = mode === 'native' && root.__seerrNativeLoadingVisible === true;
    const loadingMarkup = mode === 'skeleton'
      ? rails.slice(0, Math.min(rails.length, 4)).map(skeletonRailTemplate).join('')
      : nativeLoaderVisible
        ? ''
        : '<div class="seerr-discover__notice seerr-discover__loading-fallback">Loading Discover...</div>';

    root.innerHTML = `
      <div class="seerr-discover seerr-discover--loading" aria-busy="true" aria-label="Loading Discover" role="status">
        <div data-seerr-rails>
          ${loadingMarkup}
        </div>
      </div>
    `;
  }

  function render() {
    ensureCustomTabRoot();
    const root = document.querySelector(rootSelector);
    if (!root) {
      state.mountedRoot = null;
      return;
    }
    ensureStyle();
    syncCustomTabVisibility();
    state.mountedRoot = root;

    if (state.loading.has(discoverLoadingKey)) {
      renderDiscoverLoading(root);
      scheduleDiscoverSpacing();
      return;
    }

    const meNotice = state.me && state.me.mapped === false
      ? '<div class="seerr-discover__notice">This Jellyfin user is not linked in Seerr, so requests are disabled. Open Seerr once or import Jellyfin users in Seerr.</div>'
      : '';
    const error = state.error ? `<div class="seerr-discover__notice">${escapeHtml(state.error)}</div>` : '';
    const railData = dedupeRailData(rails, root.__seerrRailData);

    root.innerHTML = `
      <div class="seerr-discover">
        ${meNotice}
        ${error}
        <div data-seerr-rails>
          ${rails.length ? rails.map((rail) => railTemplate(rail, railData[rail.id] || [])).join('') : '<div class="seerr-discover__notice">No Discover rails are enabled.</div>'}
        </div>
      </div>
    `;
    bindRoot(root);
    scheduleDiscoverSpacing();
  }

  function bindRoot(root) {
    bindCards(root);
  }

  function bindCards(container) {
    container.querySelectorAll('[data-seerr-id]').forEach((button) => {
      button.addEventListener('click', () => openDetails(button.getAttribute('data-seerr-type'), button.getAttribute('data-seerr-id')));
    });
  }

  function renderModal(detail) {
    closeModal();
    const type = mediaType(detail);
    const backdrop = tmdbImage(detail.backdropPath || detail.posterPath, 'w1280');
    const poster = detail.posterPath ? tmdbImage(detail.posterPath, 'w780') : tmdbImage(detail.backdropPath, 'w1280');
    const posterSrcSet = detail.posterPath ? tmdbSrcSet(detail.posterPath, ['w342', 'w500', 'w780']) : tmdbSrcSet(detail.backdropPath, ['w780', 'w1280']);
    const posterIsBackdropFallback = !detail.posterPath && Boolean(detail.backdropPath);
    const available = isJellyfinAvailable(detail);
    const requested = !available && statusLabel(detail) === 'Requested';
    const jellyfinDetailUrl = jellyfinItemUrl(detail);
    const jellyfinWatchUrl = jellyfinPlaybackUrl(detail);
    const seerrUrl = seerrItemUrl(detail);
    const mapped = !state.me || state.me.mapped !== false;
    const requestDisabled = !mapped;
    const trailers = trailerLinks(detail);
    const meta = modalMetaChips(detail, type);
    const facts = modalFacts(detail, type);
    const people = modalPeople(detail);
    const keywords = modalKeywords(detail);
    const primaryActions = available
      ? availableActions(jellyfinDetailUrl, jellyfinWatchUrl)
      : requested
        ? requestedActions()
      : requestActions(requestDisabled, mapped);
    const tagline = detail.tagline ? `<p class="seerr-modal__tagline">${escapeHtml(detail.tagline)}</p>` : '';
    const rating = ratingTemplate(detail);
    const title = mediaTitle(detail);
    const year = (mediaDate(detail) || '').slice(0, 4);
    const eyebrow = [type.toUpperCase(), year, statusLabel(detail)].filter(Boolean).join(' · ');
    const metaSection = meta.length
      ? `<div class="seerr-modal__meta">${meta.map((value) => `<span class="seerr-modal__chip">${escapeHtml(value)}</span>`).join('')}</div>`
      : '';
    const factsSection = facts.length
      ? `<section class="seerr-modal__section">
          <h3>Details</h3>
          <div class="seerr-modal__facts">
            ${facts.map((fact) => `<div><div class="seerr-modal__fact-label">${escapeHtml(fact.label)}</div><div class="seerr-modal__fact-value">${escapeHtml(fact.value)}</div></div>`).join('')}
          </div>
        </section>`
      : '';
    const peopleSection = people.length
      ? `<div class="seerr-modal__people">
          ${people.map((group) => `<section class="seerr-modal__section">
            <h3>${escapeHtml(group.title)}</h3>
            <div class="seerr-modal__person-list">
              ${group.items.map((person) => `<div class="seerr-modal__person">${personAvatar(person)}<div><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.detail)}</span></div></div>`).join('')}
            </div>
          </section>`).join('')}
        </div>`
      : '';
    const keywordSection = keywords.length
      ? `<section class="seerr-modal__section">
          <h3>Tags</h3>
          <div class="seerr-modal__keywords">
            ${keywords.map((keyword) => `<span class="seerr-modal__chip">${escapeHtml(keyword)}</span>`).join('')}
          </div>
        </section>`
      : '';
    const trailerAction = trailerDropdown(trailers);
    const modal = document.createElement('div');
    modal.className = 'seerr-modal';
    const posterClass = posterIsBackdropFallback ? ' seerr-modal__poster--backdrop' : '';
    const posterStyle = poster ? ` style="--seerr-artwork:url('${escapeHtml(poster)}')"` : '';
    const posterSrcSetAttribute = posterSrcSet ? ` srcset="${escapeHtml(posterSrcSet)}" sizes="(max-width: 720px) 10rem, 13.25rem"` : '';
    modal.innerHTML = `
      <div class="seerr-modal__panel" role="dialog" aria-modal="true" aria-labelledby="seerr-modal-title" aria-describedby="seerr-modal-overview">
        <button class="seerr-modal__close" type="button" aria-label="Close">&times;</button>
        <section class="seerr-modal__hero" style="${backdrop ? `background-image:url('${escapeHtml(backdrop)}')` : ''}">
          <div class="seerr-modal__hero-content">
          <div class="seerr-modal__poster${posterClass}"${posterStyle}>${poster ? `<img src="${escapeHtml(poster)}"${posterSrcSetAttribute} alt="">` : ''}</div>
            <div class="seerr-modal__header">
              <p class="seerr-modal__eyebrow">${escapeHtml(eyebrow)}</p>
              <h2 id="seerr-modal-title">${escapeHtml(title)}</h2>
              <div class="seerr-modal__headline-meta">
                ${rating}
                ${metaSection}
              </div>
              ${tagline}
              <div class="seerr-modal__actions">
                ${primaryActions}
                ${trailerAction}
                ${seerrAction(seerrUrl)}
              </div>
            </div>
          </div>
        </section>
        <div class="seerr-modal__details">
          <div class="seerr-modal__main">
            <section class="seerr-modal__section">
              <h3>Overview</h3>
              <p id="seerr-modal-overview" class="seerr-modal__overview">${escapeHtml(detail.overview || 'No overview available.')}</p>
            </section>
            ${peopleSection}
            <div class="seerr-modal__related" data-seerr-related></div>
          </div>
          <aside class="seerr-modal__aside">
            ${factsSection}
            ${keywordSection}
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const trailerMenu = modal.querySelector('[data-seerr-trailer-menu]');
    modal.querySelector('.seerr-modal__close')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target instanceof Element && !event.target.closest('[data-seerr-trailer-menu]')) {
        setTrailerMenuOpen(trailerMenu, false);
      }
      if (event.target === modal) closeModal();
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });
    modal.querySelector('[data-seerr-trailer-toggle]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setTrailerMenuOpen(trailerMenu, trailerMenu?.getAttribute('data-open') !== 'true');
    });
    modal.querySelectorAll('[data-seerr-trailer-url]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleTrailerClick(modal, button.getAttribute('data-seerr-trailer-url'));
      });
    });
    modal.querySelector('[data-seerr-request]')?.addEventListener('click', (event) => {
      requestMedia(type, detail, event.currentTarget);
    });
    modal.querySelector('.seerr-modal__close')?.focus();
    loadRelatedRails(type, detail.id, modal);
  }

  function loadRelatedRails(type, id, modal) {
    const target = modal.querySelector('[data-seerr-related]');
    if (!target || !type || !id) return;

    apiFetch(`/SeerrDiscover/related/${encodeURIComponent(type)}/${encodeURIComponent(id)}`)
      .then((data) => {
        const relatedRails = Array.isArray(data?.rails) ? data.rails : [];
        return Promise.all(relatedRails.map((rail) => filterAndEnrichItems(rail.results)
          .then((items) => ({
            id: String(rail.id || ''),
            title: String(rail.title || ''),
            items,
          }))));
      })
      .then((relatedRails) => {
        if (!document.body.contains(modal)) return;
        const activeRails = relatedRails.filter((rail) => rail.id && rail.title && rail.items.length);
        if (!activeRails.length) {
          target.innerHTML = '';
          return;
        }

        target.innerHTML = activeRails
          .map((rail) => railTemplate({ id: `related-${rail.id}`, title: rail.title }, rail.items))
          .join('');
        bindCards(target);
      })
      .catch((error) => {
        console.warn('Seerr Discover related rails failed', error);
      });
  }

  function requestActions(requestDisabled, mapped) {
    return `<button class="seerr-discover__button emby-button" type="button" data-seerr-request ${requestDisabled ? 'disabled' : ''}>${escapeHtml(mapped ? 'Request' : 'Not linked')}</button>`;
  }

  function availableActions(detailUrl, watchUrl) {
    if (!detailUrl && !watchUrl) {
      return '<button class="seerr-discover__button emby-button" type="button" disabled>Available</button>';
    }

    return [
      !detailUrl && !watchUrl ? '<button class="seerr-discover__button emby-button" type="button" disabled>Available</button>' : '',
      watchUrl ? `<a class="seerr-discover__button emby-button" href="${escapeHtml(watchUrl)}">Watch Now</a>` : '',
      detailUrl ? `<a class="seerr-discover__button emby-button seerr-discover__button--secondary" href="${escapeHtml(detailUrl)}">Open Details</a>` : '',
    ].join('');
  }

  function requestedActions() {
    return '<button class="seerr-discover__button emby-button seerr-discover__button--success" type="button" disabled>Requested</button>';
  }

  function seerrAction(seerrUrl) {
    return seerrUrl
      ? `<a class="seerr-discover__button emby-button seerr-discover__button--seerr" href="${escapeHtml(seerrUrl)}" target="_blank" rel="noopener noreferrer">Open in Seerr</a>`
      : '';
  }

  function trailerDropdown(trailers) {
    if (!trailers.length) return '';

    const primary = trailers[0];
    const primaryLabel = isMobileTrailerContext() ? 'Copy Trailer Link' : 'Watch Trailer';
    return `
      <div class="seerr-modal__trailer-menu" data-seerr-trailer-menu>
        <div class="seerr-modal__trailer-split">
          <button class="seerr-discover__button emby-button seerr-discover__button--secondary seerr-modal__trailer-main" type="button" data-seerr-trailer-url="${escapeHtml(primary.url)}">
            <span class="seerr-modal__play-icon" aria-hidden="true"></span>
            <span>${primaryLabel}</span>
          </button>
          <button class="seerr-discover__button emby-button seerr-discover__button--secondary seerr-modal__trailer-toggle" type="button" data-seerr-trailer-toggle aria-label="Choose trailer" aria-expanded="false">
            <span class="seerr-modal__trailer-caret" aria-hidden="true"></span>
          </button>
        </div>
        <div class="seerr-modal__trailer-list" role="menu">
          ${trailers.map((video, index) => `
            <button class="seerr-modal__trailer-link" type="button" data-seerr-trailer-url="${escapeHtml(video.url)}" role="menuitem">
              <span class="seerr-modal__play-icon" aria-hidden="true"></span>
              <span>${escapeHtml(video.name || `Trailer ${index + 1}`)}</span>
            </button>
          `).join('')}
        </div>
        <div class="seerr-modal__inline-notice" data-seerr-trailer-notice></div>
      </div>
    `;
  }

  function handleTrailerClick(modal, url) {
    if (!url) return;
    setTrailerMenuOpen(modal.querySelector('[data-seerr-trailer-menu]'), false);

    if (!isMobileTrailerContext()) {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (opened) return;
    }

    copyText(url)
      .then(() => showTrailerNotice(modal, 'Trailer link copied. Open it in your browser to watch.'))
      .catch(() => showTrailerNotice(modal, `Trailer link: ${url}`));
  }

  function isMobileTrailerContext() {
    const userAgent = navigator.userAgent || '';
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const narrowViewport = window.matchMedia && window.matchMedia('(max-width: 48em)').matches;
    return coarsePointer || narrowViewport || /Android|iPhone|iPad|iPod|Mobile|Jellyfin/i.test(userAgent);
  }

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand('copy') ? Promise.resolve() : Promise.reject(new Error('Clipboard copy failed'));
    } catch (error) {
      return Promise.reject(error);
    } finally {
      textarea.remove();
    }
  }

  function showTrailerNotice(modal, message) {
    const notice = modal.querySelector('[data-seerr-trailer-notice]');
    if (!notice) return;
    notice.textContent = message;
    notice.setAttribute('data-visible', 'true');
  }

  function setTrailerMenuOpen(menu, open) {
    if (!menu) return;
    menu.setAttribute('data-open', open ? 'true' : 'false');
    menu.querySelector('[data-seerr-trailer-toggle]')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function ratingTemplate(detail) {
    const vote = Number(detail.voteAverage);
    if (!Number.isFinite(vote) || vote <= 0) return '';

    const count = Number(detail.voteCount);
    const countText = Number.isFinite(count) && count > 0 ? `${compactNumber(count)} votes` : 'TMDB votes';
    return `<div class="seerr-modal__rating"><strong>TMDB ${vote.toFixed(1)}</strong><span>${escapeHtml(countText)}</span></div>`;
  }

  function modalMetaChips(detail, type) {
    const chips = [];
    const certification = contentRating(detail, type);
    const date = mediaDate(detail);
    const runtime = runtimeLabel(detail, type);

    if (certification) chips.push(certification);
    if (date) chips.push(formatDate(date));
    if (runtime) chips.push(runtime);

    (detail.genres || [])
      .map((genre) => genre?.name)
      .filter(Boolean)
      .slice(0, 3)
      .forEach((genre) => chips.push(genre));

    return chips;
  }

  function modalFacts(detail, type) {
    const facts = [
      ['Status', detail.status || statusLabel(detail)],
      [type === 'tv' ? 'First aired' : 'Release date', mediaDate(detail) ? formatDate(mediaDate(detail)) : ''],
      ['Original language', languageName(detail.originalLanguage)],
      ['Country', firstCountry(detail)],
      ['Studios', companyNames(detail).slice(0, 2).join(', ')],
    ];

    return facts
      .filter((fact) => fact[1])
      .map(([label, value]) => ({ label, value }));
  }

  function modalPeople(detail) {
    const groups = [];
    const cast = ((detail.credits && detail.credits.cast) || [])
      .filter((person) => person?.name)
      .slice(0, 4)
      .map((person) => ({
        name: person.name,
        detail: person.character || 'Cast',
        image: personProfileImage(person),
      }));
    const crew = prioritizedCrew(detail).slice(0, 3);

    if (cast.length) groups.push({ title: 'Cast', items: cast });
    if (crew.length) groups.push({ title: 'Crew', items: crew });
    return groups;
  }

  function personProfileImage(person) {
    return tmdbImage(person?.profilePath || person?.profile_path, 'w185');
  }

  function personAvatar(person) {
    if (person.image) {
      return `<img class="seerr-modal__person-avatar" src="${escapeHtml(person.image)}" alt="" loading="lazy">`;
    }

    return `<span class="seerr-modal__person-avatar seerr-modal__person-avatar--placeholder" aria-hidden="true">${escapeHtml(personInitial(person.name))}</span>`;
  }

  function personInitial(name) {
    return String(name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function modalKeywords(detail) {
    return (detail.keywords || [])
      .map((keyword) => keyword?.name)
      .filter(Boolean)
      .slice(0, 6);
  }

  function prioritizedCrew(detail) {
    const people = [];
    const seen = new Set();

    ((detail.createdBy || [])).forEach((person) => addCrew(people, seen, person?.name, 'Creator', personProfileImage(person)));
    const crew = ((detail.credits && detail.credits.crew) || []).filter((person) => person?.name);
    const priorities = ['Director', 'Creator', 'Writer', 'Screenplay'];
    priorities.forEach((job) => {
      crew.filter((person) => String(person.job || '').toLowerCase() === job.toLowerCase())
        .forEach((person) => addCrew(people, seen, person.name, person.job, personProfileImage(person)));
    });

    crew
      .filter((person) => ['Directing', 'Writing'].includes(person.department))
      .forEach((person) => addCrew(people, seen, person.name, person.job || person.department, personProfileImage(person)));

    return people;
  }

  function addCrew(items, seen, name, detail, image) {
    if (!name) return;
    const key = `${name}:${detail || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ name, detail: detail || 'Crew', image });
  }

  function contentRating(detail, type) {
    const preferredCountries = ['AU', 'US', 'GB'];
    if (type === 'tv') {
      const ratings = detail.contentRatings?.results || [];
      const match = preferredCountries
        .map((country) => ratings.find((rating) => rating?.iso_3166_1 === country && rating.rating))
        .find(Boolean);
      return match?.rating || '';
    }

    const releases = detail.releases?.results || [];
    for (const country of preferredCountries) {
      const release = releases.find((item) => item?.iso_3166_1 === country);
      const dated = (release?.releaseDates || []).find((item) => item?.certification);
      if (dated?.certification) return dated.certification;
    }

    return '';
  }

  function runtimeLabel(detail, type) {
    if (type === 'tv') {
      const seasons = Number(detail.numberOfSeasons);
      const episodes = Number(detail.numberOfEpisodes);
      return [
        Number.isFinite(seasons) && seasons > 0 ? `${seasons} ${seasons === 1 ? 'season' : 'seasons'}` : '',
        Number.isFinite(episodes) && episodes > 0 ? `${episodes} ${episodes === 1 ? 'episode' : 'episodes'}` : '',
      ].filter(Boolean).join(' / ');
    }

    const minutes = Number(detail.runtime);
    if (!Number.isFinite(minutes) || minutes <= 0) return '';
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
  }

  function firstCountry(detail) {
    const country = (detail.productionCountries || [])[0] || {};
    return country.name || (detail.originCountry || [])[0] || '';
  }

  function companyNames(detail) {
    return (detail.productionCompanies || [])
      .map((company) => company?.name)
      .filter(Boolean);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function languageName(code) {
    if (!code) return '';
    try {
      if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
        return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(code) || code.toUpperCase();
      }
    } catch {
      // Fall through to the stable code display.
    }

    return String(code).toUpperCase();
  }

  function compactNumber(value) {
    try {
      return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    } catch {
      return String(value);
    }
  }

  function seerrItemUrl(detail) {
    const base = String(state.me?.seerrPublicUrl || '').trim().replace(/\/+$/, '');
    if (!base || !detail?.id) return '';
    return `${base}/${mediaType(detail) === 'tv' ? 'tv' : 'movie'}/${encodeURIComponent(detail.id)}`;
  }

  function trailerLinks(detail) {
    const videos = Array.isArray(detail.relatedVideos) ? detail.relatedVideos : [];
    return videos
      .filter((video) => video && video.url && (!video.site || video.site.toLowerCase() === 'youtube'))
      .sort((left, right) => trailerRank(left) - trailerRank(right))
      .slice(0, 4);
  }

  function trailerRank(video) {
    const type = String(video.type || '').toLowerCase();
    if (type === 'trailer') return 0;
    if (type === 'teaser') return 1;
    return 2;
  }

  function jellyfinItemUrl(detail) {
    const mediaInfo = detail.mediaInfo || {};
    if (mediaInfo.mediaUrl || mediaInfo.media?.mediaUrl) {
      return mediaInfo.mediaUrl || mediaInfo.media?.mediaUrl || '';
    }

    if (detail.__jellyfinItem?.Id) {
      return jellyfinDetailUrl(detail.__jellyfinItem.Id);
    }

    return '';
  }

  function jellyfinPlaybackUrl(detail) {
    const detailUrl = jellyfinItemUrl(detail);
    if (!detailUrl) return '';

    try {
      const parsed = new URL(detailUrl, window.location.origin);
      const queryIndex = parsed.hash.indexOf('?');
      const route = queryIndex === -1 ? (parsed.hash || '#/details') : parsed.hash.slice(0, queryIndex);
      const params = new URLSearchParams(queryIndex === -1 ? '' : parsed.hash.slice(queryIndex + 1));
      params.set('seerrDiscoverPlay', '1');
      parsed.hash = `${route || '#/details'}?${params.toString()}`;
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function jellyfinDetailUrl(itemId) {
    const parsed = new URL('/web/index.html', window.location.origin);
    const params = new URLSearchParams({
      id: itemId,
      context: 'home',
    });
    const serverId = jellyfinServerId();
    if (serverId) {
      params.set('serverId', serverId);
    }

    parsed.hash = `!/details?${params.toString()}`;
    return parsed.toString();
  }

  function jellyfinServerId() {
    try {
      if (window.ApiClient && typeof window.ApiClient.serverInfo === 'function') {
        return window.ApiClient.serverInfo()?.Id || '';
      }

      return window.ApiClient?._serverInfo?.Id || '';
    } catch {
      return '';
    }
  }

  function enrichWithJellyfinItem(detail) {
    if (jellyfinItemUrl(detail)) {
      return Promise.resolve(detail);
    }

    return lookupJellyfinItem(detail)
      .then((item) => attachJellyfinItem(detail, item));
  }

  function filterAndEnrichItems(items) {
    const results = supportedResults(items);
    return Promise.all(results.map((item) => {
      return lookupJellyfinItem(item)
        .then((jellyfinItem) => ({
          item: attachJellyfinItem(item, jellyfinItem),
          watched: Boolean(jellyfinItem?.UserData?.Played),
        }));
    })).then((entries) => entries
      .filter((entry) => !entry.watched)
      .map((entry) => entry.item));
  }

  function filterNativeSearchItems(items) {
    const results = supportedResults(items);
    return Promise.all(results.map((item) => {
      if (jellyfinItemUrl(item)) {
        return Promise.resolve({ item, available: true });
      }

      return lookupJellyfinItem(item)
        .then((jellyfinItem) => ({
          item,
          available: Boolean(jellyfinItem?.Id),
        }));
    })).then((entries) => entries
      .filter((entry) => !entry.available)
      .map((entry) => entry.item));
  }

  function isJellyfinAvailable(item) {
    return Boolean(item?.__jellyfinItem?.Id || jellyfinItemUrl(item));
  }

  function attachJellyfinItem(item, jellyfinItem) {
    if (!jellyfinItem?.Id || item?.__jellyfinItem?.Id) return item;
    return { ...item, __jellyfinItem: jellyfinItem };
  }

  function lookupJellyfinItem(item) {
    const key = jellyfinLookupKey(item);
    if (!key) return Promise.resolve(null);
    if (state.jellyfinItemCache.has(key)) return Promise.resolve(state.jellyfinItemCache.get(key));

    return findJellyfinItem(item)
      .then((jellyfinItem) => {
        const result = jellyfinItem || null;
        state.jellyfinItemCache.set(key, result);
        return result;
      })
      .catch((error) => {
        console.warn('Seerr Discover Jellyfin lookup failed', error);
        state.jellyfinItemCache.set(key, null);
        return null;
      });
  }

  function jellyfinLookupKey(item) {
    const tmdbId = tmdbIdFor(item);
    return tmdbId ? `${mediaType(item)}:${tmdbId}` : '';
  }

  function tmdbIdFor(item) {
    return String(item?.mediaInfo?.tmdbId || item?.id || '');
  }

  function findJellyfinItem(detail) {
    const tmdbId = tmdbIdFor(detail);
    if (!tmdbId) return Promise.resolve(null);

    const params = new URLSearchParams({
      Recursive: 'true',
      IncludeItemTypes: mediaType(detail) === 'tv' ? 'Series' : 'Movie',
      SearchTerm: mediaTitle(detail),
      Fields: 'ProviderIds,UserData',
      EnableUserData: 'true',
      Limit: '12',
    });

    return jellyfinFetch(`/Items?${params.toString()}`)
      .then((data) => {
        const items = Array.isArray(data?.Items) ? data.Items : [];
        return items.find((item) => String(item.ProviderIds?.Tmdb || item.ProviderIds?.TMDB || '') === tmdbId) || null;
      });
  }

  function nativeSearchPage() {
    const visiblePage = document.querySelector('#searchPage:not(.hide)');
    if (visiblePage) return visiblePage;

    return (window.location.hash || '').includes('/search') ? document.querySelector('#searchPage') : null;
  }

  function nativeSearchInput() {
    return nativeSearchPage()?.querySelector('#searchTextInput') || null;
  }

  function nativeSearchSection() {
    return document.querySelector('[data-seerr-native-search]');
  }

  function loadClientConfig() {
    if (state.clientConfig) {
      return Promise.resolve(state.clientConfig);
    }

    if (!state.clientConfigPromise) {
      state.clientConfigPromise = apiFetch('/SeerrDiscover/client-config')
        .then((config) => {
          state.clientConfig = config || {};
          rails = normalizeClientRails(state.clientConfig.discoverRails);
          return state.clientConfig;
        })
        .catch((error) => {
          console.warn('Seerr Discover client config failed', error);
          state.clientConfig = {};
          rails = defaultRails;
          return state.clientConfig;
        });
    }

    return state.clientConfigPromise;
  }

  function normalizeClientRails(discoverRails) {
    if (!Array.isArray(discoverRails)) {
      return defaultRails;
    }

    return discoverRails
      .filter((rail) => rail && rail.feed && rail.id && rail.title)
      .map((rail) => ({
        id: String(rail.id),
        title: String(rail.title),
        feed: String(rail.feed),
      }));
  }

  function ensureNativeSearchEnabled() {
    if (nativeSearch.enabled !== null) {
      return Promise.resolve(nativeSearch.enabled);
    }

    if (!nativeSearch.enabledPromise) {
      nativeSearch.enabledPromise = loadClientConfig()
        .then((config) => {
          nativeSearch.enabled = config?.enableNativeSearchIntegration !== false;
          if (!nativeSearch.enabled) {
            return false;
          }

          return loadMe().then(() => true);
        })
        .catch((error) => {
          console.warn('Seerr Discover native search config failed', error);
          nativeSearch.enabled = true;
          return loadMe().then(() => true);
        });
    }

    return nativeSearch.enabledPromise;
  }

  function scheduleNativeSearchAttach() {
    window.setTimeout(tryAttachNativeSearch, 80);
    window.setTimeout(tryAttachNativeSearch, 350);
    window.setTimeout(tryAttachNativeSearch, 1000);
  }

  function tryAttachNativeSearch() {
    const input = nativeSearchInput();
    if (!input) {
      nativeSearch.lastQuery = '';
      nativeSearch.pendingQuery = '';
      nativeSearch.loadingQuery = '';
      nativeSearch.requestId += 1;
      removeNativeSearchSection();
      nativeSearch.input = null;
      return;
    }

    ensureNativeSearchEnabled().then((enabled) => {
      if (input !== nativeSearchInput()) {
        return;
      }

      if (!enabled) {
        removeNativeSearchSection();
        return;
      }

      if (nativeSearch.input !== input && !input.dataset.seerrNativeSearchAttached) {
        input.addEventListener('input', handleNativeSearchInput);
        input.addEventListener('change', handleNativeSearchInput);
        input.dataset.seerrNativeSearchAttached = 'true';
      }

      nativeSearch.input = input;
      handleNativeSearchInput();
    });
  }

  function handleNativeSearchInput() {
    const input = nativeSearchInput();
    const query = String(input?.value || '').trim();

    if (!query) {
      nativeSearch.lastQuery = '';
      nativeSearch.pendingQuery = '';
      nativeSearch.loadingQuery = '';
      nativeSearch.requestId += 1;
      window.clearTimeout(nativeSearch.debounceId);
      removeNativeSearchSection();
      return;
    }

    if (
      nativeSearch.pendingQuery === query
      || nativeSearch.loadingQuery === query
      || (nativeSearch.renderedQuery === query && nativeSearchSection())
    ) {
      return;
    }

    window.clearTimeout(nativeSearch.debounceId);
    nativeSearch.pendingQuery = query;
    nativeSearch.debounceId = window.setTimeout(() => runNativeSearch(query), 500);
  }

  function runNativeSearch(query) {
    if (!query) {
      removeNativeSearchSection();
      return;
    }

    const requestId = nativeSearch.requestId + 1;
    const hasSameRenderedSection = nativeSearch.renderedQuery === query && nativeSearchSection();
    nativeSearch.requestId = requestId;
    nativeSearch.lastQuery = query;
    nativeSearch.pendingQuery = '';
    nativeSearch.loadingQuery = query;
    if (!hasSameRenderedSection) {
      removeNativeSearchSection();
    }

    apiFetch(`/SeerrDiscover/search?query=${encodeURIComponent(query)}&page=1`)
      .then((data) => filterNativeSearchItems(data.results))
      .then((items) => {
        if (requestId !== nativeSearch.requestId || query !== nativeSearch.lastQuery) return;
        nativeSearch.loadingQuery = '';
        if (!items.length) {
          removeNativeSearchSection();
          return;
        }
        renderNativeSearchSection(items, query);
      })
      .catch((error) => {
        if (requestId !== nativeSearch.requestId) return;
        nativeSearch.loadingQuery = '';
        console.warn('Seerr Discover native search failed', error);
        if (!hasSameRenderedSection) {
          removeNativeSearchSection();
        }
      });
  }

  function refreshNativeSearch() {
    const query = String(nativeSearchInput()?.value || '').trim();
    if (query) {
      runNativeSearch(query);
    }
  }

  function removeNativeSearchSection() {
    nativeSearch.renderedQuery = '';
    if (nativeSearch.repositionObserver) {
      nativeSearch.repositionObserver.disconnect();
      nativeSearch.repositionObserver = null;
    }
    if (nativeSearch.repositionTimeout) {
      window.clearTimeout(nativeSearch.repositionTimeout);
      nativeSearch.repositionTimeout = 0;
    }

    document.querySelectorAll('[data-seerr-native-search]').forEach((section) => section.remove());
    document.querySelectorAll('[data-seerr-hidden-no-results]').forEach((message) => {
      message.classList.remove('hide');
      message.removeAttribute('data-seerr-hidden-no-results');
    });
  }

  function renderNativeSearchSection(items, query) {
    ensureStyle();
    const page = nativeSearchPage();
    if (!page) return;

    removeNativeSearchSection();
    const section = document.createElement('section');
    section.className = 'verticalSection seerr-native-search';
    section.setAttribute('data-seerr-native-search', 'true');
    section.setAttribute('data-seerr-query', query);
    section.innerHTML = `
      <h2 class="sectionTitle sectionTitle-cards focuscontainer-x padded-left padded-right">Requestable from Seerr</h2>
      <div class="seerr-discover__scroller padded-left padded-right">
        ${items.map(card).join('')}
      </div>
    `;

    placeNativeSearchSection(page, section);
    nativeSearch.renderedQuery = query;
    bindNativeSearchSection(section);
    watchNativeSearchPlacement(page, section);
  }

  function bindNativeSearchSection(section) {
    section.querySelectorAll('[data-seerr-id]').forEach((button) => {
      button.addEventListener('click', () => openDetails(button.getAttribute('data-seerr-type'), button.getAttribute('data-seerr-id')));
    });
  }

  function placeNativeSearchSection(page, section) {
    const primary = lastNativePrimarySection(page);
    if (primary) {
      primary.after(section);
      return true;
    }

    const noResultsMessage = visibleNativeNoResultsMessage(page);
    if (noResultsMessage?.parentElement) {
      noResultsMessage.after(section);
      return false;
    }

    const resultsContainer = page.querySelector('.searchResults, [class*="searchResults"], .padded-top.padded-bottom-page');
    if (resultsContainer) {
      resultsContainer.appendChild(section);
      return false;
    }

    page.appendChild(section);
    return false;
  }

  function lastNativePrimarySection(page) {
    const primarySectionKeywords = ['movies', 'shows', 'film', 'films', 'series', 'serier', 'filme', 'serien', 'peliculas', 'serie tv'];
    const sections = Array.from(page.querySelectorAll('.verticalSection:not([data-seerr-native-search])'));
    for (let index = sections.length - 1; index >= 0; index -= 1) {
      const title = sections[index].querySelector('.sectionTitle')?.textContent.trim().toLowerCase();
      if (title && primarySectionKeywords.some((keyword) => title.includes(keyword))) {
        return sections[index];
      }
    }
    return null;
  }

  function visibleNativeNoResultsMessage(page) {
    return Array.from(page.querySelectorAll('.noItemsMessage'))
      .find((message) => !message.classList.contains('hide') && message.textContent.trim());
  }

  function watchNativeSearchPlacement(page, section) {
    if (nativeSearch.repositionObserver) {
      nativeSearch.repositionObserver.disconnect();
    }

    nativeSearch.repositionObserver = new MutationObserver(() => {
      if (!document.documentElement.contains(section)) {
        nativeSearch.repositionObserver?.disconnect();
        nativeSearch.repositionObserver = null;
        return;
      }

      const primary = lastNativePrimarySection(page);
      if (primary && primary.nextSibling !== section) {
        primary.after(section);
        return;
      }

      const noResultsMessage = !primary ? visibleNativeNoResultsMessage(page) : null;
      if (noResultsMessage && noResultsMessage.nextSibling !== section) {
        noResultsMessage.after(section);
      }
    });
    nativeSearch.repositionObserver.observe(page, { childList: true, subtree: true });
    nativeSearch.repositionTimeout = window.setTimeout(() => {
      nativeSearch.repositionObserver?.disconnect();
      nativeSearch.repositionObserver = null;
      nativeSearch.repositionTimeout = 0;
    }, 5000);
  }

  function getHashParams() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    return queryIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(queryIndex + 1));
  }

  function replaceHashParams(params) {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    const route = queryIndex === -1 ? hash : hash.slice(0, queryIndex);
    const query = params.toString();
    window.history.replaceState(window.history.state, document.title, `${window.location.pathname}${window.location.search}${route}${query ? `?${query}` : ''}`);
  }

  function maybeStartJellyfinPlayback(attempt = 0) {
    const params = getHashParams();
    if (params.get('seerrDiscoverPlay') !== '1') return;

    const itemId = params.get('id') || '';
    const key = `${itemId}:${window.location.hash}`;
    if (state.autoplayKey && state.autoplayKey !== key && attempt === 0) {
      state.autoplayKey = '';
    }
    if (state.autoplayKey === key && attempt === 0) return;

    const playButton = Array.from(document.querySelectorAll('.mainDetailButtons .btnPlay, .mainDetailButtons .btnReplay'))
      .find((button) => button instanceof HTMLButtonElement && !button.disabled && !button.classList.contains('hide'));

    if (playButton) {
      state.autoplayKey = key;
      params.delete('seerrDiscoverPlay');
      replaceHashParams(params);
      playButton.click();
      return;
    }

    if (attempt < 30) {
      window.setTimeout(() => maybeStartJellyfinPlayback(attempt + 1), 250);
    }
  }

  function closeModal() {
    document.querySelectorAll('.seerr-modal').forEach((modal) => modal.remove());
  }

  function setError(message) {
    state.error = message || '';
    render();
  }

  function showError(message) {
    if (document.querySelector(rootSelector)) {
      setError(message);
      return;
    }

    showToast(message, 'error', { timeout: 7000 });
  }

  function isDiscoverRootActive(root) {
    const pane = root?.closest('.seerr-discover-tab-content, .tabContent, .pageTabContent');
    if (!pane) return true;
    return pane.dataset.seerrActive !== 'false' && pane.getAttribute('aria-hidden') !== 'true' && pane.hidden !== true;
  }

  function showDiscoverNativeLoading() {
    const dashboard = currentDashboard();
    if (dashboard && typeof dashboard.showLoadingMsg === 'function') {
      dashboard.showLoadingMsg();
      return true;
    }
    return false;
  }

  function hideDiscoverNativeLoading() {
    const dashboard = currentDashboard();
    if (dashboard && typeof dashboard.hideLoadingMsg === 'function') {
      dashboard.hideLoadingMsg();
    }
  }

  function ensureDiscoverNativeLoading(root) {
    if (root.__seerrLoadingMode !== 'native' || root.__seerrNativeLoadingVisible === true || !isDiscoverRootActive(root)) {
      return;
    }
    root.__seerrNativeLoadingVisible = showDiscoverNativeLoading();
  }

  function startDiscoverLoading(root) {
    root.__seerrLoadingMode = discoverLoadingMode();
    root.__seerrNativeLoadingVisible = false;
    root.dataset.seerrLoading = root.__seerrLoadingMode;
    root.setAttribute('aria-busy', 'true');
    state.loading.add(discoverLoadingKey);
    ensureDiscoverNativeLoading(root);
  }

  function finishDiscoverLoading(root) {
    if (root?.__seerrNativeLoadingVisible === true) {
      hideDiscoverNativeLoading();
    }
    if (root) {
      root.__seerrNativeLoadingVisible = false;
      root.removeAttribute('aria-busy');
      delete root.dataset.seerrLoading;
    }
    state.loading.delete(discoverLoadingKey);
  }

  function showToast(message, variant = 'info', options = {}) {
    const id = nextToastId++;
    const timeout = Number.isFinite(options.timeout) ? options.timeout : 4500;
    state.toasts = [...state.toasts, { id, message, variant, timeoutId: null }].slice(-4);
    renderToasts();
    scheduleToastDismiss(id, timeout);
    return id;
  }

  function updateToast(id, message, variant = 'info', options = {}) {
    const timeout = Number.isFinite(options.timeout) ? options.timeout : 4500;
    state.toasts = state.toasts.map((toast) => {
      if (toast.id !== id) return toast;
      if (toast.timeoutId) window.clearTimeout(toast.timeoutId);
      return { ...toast, message, variant, timeoutId: null };
    });
    renderToasts();
    scheduleToastDismiss(id, timeout);
  }

  function scheduleToastDismiss(id, timeout) {
    if (timeout <= 0) return;
    const toast = state.toasts.find((item) => item.id === id);
    if (!toast) return;
    toast.timeoutId = window.setTimeout(() => dismissToast(id), timeout);
  }

  function dismissToast(id) {
    const toast = state.toasts.find((item) => item.id === id);
    if (toast?.timeoutId) window.clearTimeout(toast.timeoutId);
    state.toasts = state.toasts.filter((item) => item.id !== id);
    renderToasts();
  }

  function ensureToastRegion() {
    ensureStyle();
    let region = document.querySelector('[data-seerr-toast-region]');
    if (region) return region;

    region = document.createElement('div');
    region.className = 'seerr-toast-region';
    region.setAttribute('data-seerr-toast-region', '');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-relevant', 'additions text');
    document.body.appendChild(region);
    return region;
  }

  function renderToasts() {
    const region = ensureToastRegion();
    region.innerHTML = state.toasts.map((toast) => `
      <div class="seerr-toast seerr-toast--${escapeHtml(toast.variant)}" role="${toast.variant === 'error' ? 'alert' : 'status'}">
        <div class="seerr-toast__message">${escapeHtml(toast.message)}</div>
        <button class="seerr-toast__close" type="button" data-seerr-toast-close="${toast.id}" aria-label="Dismiss notification">&times;</button>
      </div>
    `).join('');

    region.querySelectorAll('[data-seerr-toast-close]').forEach((button) => {
      button.addEventListener('click', () => {
        dismissToast(Number.parseInt(button.getAttribute('data-seerr-toast-close') || '', 10));
      });
    });
  }

  function loadMe() {
    return apiFetch('/SeerrDiscover/me')
      .then((me) => { state.me = me; })
      .catch(() => { state.me = { mapped: false }; });
  }

  function loadRails() {
    const root = document.querySelector(rootSelector);
    if (!root) return;
    root.__seerrRailData = root.__seerrRailData || {};
    return loadClientConfig()
      .then(() => Promise.all(rails.map((rail) => {
        return apiFetch(`/SeerrDiscover/discover?feed=${encodeURIComponent(rail.feed)}&page=1`)
          .then((data) => filterAndEnrichItems(data.results))
          .then((items) => { root.__seerrRailData[rail.id] = items; })
          .catch((error) => {
            root.__seerrRailData[rail.id] = [];
            console.warn('Seerr Discover rail failed', rail.id, error);
          });
      })));
  }

  function openDetails(type, id) {
    if (!type || !id) return;
    apiFetch(`/SeerrDiscover/media/${encodeURIComponent(type)}/${encodeURIComponent(id)}`)
      .then(enrichWithJellyfinItem)
      .then(renderModal)
      .catch((error) => showError(`Details failed: ${error.message || error}`));
  }

  function requestMedia(type, detail, requestButton) {
    if (requestButton) {
      requestButton.disabled = true;
      requestButton.textContent = 'Requesting...';
    }

    const requestToastId = showToast('Submitting request to Seerr...', 'info', { timeout: 0 });
    const body = {
      mediaType: type,
      mediaId: Number.parseInt(detail.id, 10),
      is4k: false,
      seasons: type === 'tv' ? 'all' : undefined,
    };
    apiFetch('/SeerrDiscover/request', { method: 'POST', body: JSON.stringify(body) })
      .then((result) => {
        renderModal(markRequested(detail, result));
        updateToast(requestToastId, 'Request created. Seerr is processing it now.', 'success');
        refreshNativeSearch();
        return Promise.all([loadMe(), loadRails()])
          .then(render)
          .catch((error) => {
            console.warn('Seerr Discover refresh failed after request', error);
            showToast('Request created, but Discover refresh failed. Refresh if the status looks stale.', 'error', { timeout: 7000 });
          });
      })
      .catch((error) => {
        if (requestButton) {
          requestButton.disabled = false;
          requestButton.textContent = 'Request';
        }
        updateToast(requestToastId, `Request failed: ${error.message || error}`, 'error', { timeout: 7000 });
      });
  }

  function markRequested(detail, result) {
    const request = result || {};
    const media = request.media || {};
    const mediaInfo = {
      ...(detail.mediaInfo || {}),
      ...media,
      status: media.status || detail.mediaInfo?.status || 2,
      requests: [
        ...((detail.mediaInfo && detail.mediaInfo.requests) || []),
        request,
      ],
    };
    return { ...detail, mediaInfo };
  }

  function mount() {
    initializeConfigPage();
    ensureCustomTabRoot();
    const root = document.querySelector(rootSelector);
    if (!root) {
      state.mountedRoot = null;
      return;
    }
    if (state.mountedRoot === root && root.__seerrMounted) return;
    root.__seerrMounted = true;
    root.__seerrRailData = {};
    startDiscoverLoading(root);
    render();
    Promise.all([loadMe(), loadRails()])
      .catch((error) => {
        state.error = error.message || String(error);
      })
      .finally(() => {
        finishDiscoverLoading(root);
        render();
      });
  }

  function initializeConfigPage(configPage) {
    const page = configPage || document.querySelector('#SeerrDiscoverConfigPage');
    if (!page || page.dataset.seerrConfigInlineLoaded === 'true') return;
    page.dataset.seerrConfigInlineLoaded = 'true';
    page.__seerrExtraRails = [];

    page.querySelector('#ExtraRailKind')?.addEventListener('change', () => enforceConfigRailMediaType(page));
    page.querySelector('#SearchExtraRailOptions')?.addEventListener('click', () => searchConfigRailOptions(page));
    page.querySelector('#SeerrDiscoverConfigForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveConfigPage(page);
      return false;
    });

    loadConfigPage(page);
  }

  const configFields = [
    'SeerrBaseUrl',
    'SeerrPublicUrl',
    'Language',
    'DiscoverCacheSeconds',
    'DetailsCacheSeconds',
    'SearchCacheSeconds',
    'UserCacheSeconds',
    'RequireMappedUser',
    'EnableNativeSearchIntegration',
    'DefaultRequest4K',
    'EnableTrendingMovies',
    'EnableTrendingTv',
    'EnableMovies',
    'EnableTv',
    'EnableUpcoming',
    'EnableUpcomingTv',
    'EnableRecentlyRequested',
    'EnablePopularWithServer',
    'EnableDetailSimilar',
    'EnableDetailRecommended',
    'EnableDetailCollections',
  ];

  function configValue(config, field) {
    if (!config) return undefined;
    if (Object.prototype.hasOwnProperty.call(config, field)) return config[field];
    const camelField = `${field.charAt(0).toLowerCase()}${field.slice(1)}`;
    return config[camelField];
  }

  function assignConfigValue(config, field, value) {
    config[field] = value;
    const camelField = `${field.charAt(0).toLowerCase()}${field.slice(1)}`;
    if (Object.prototype.hasOwnProperty.call(config, camelField)) {
      config[camelField] = value;
    }
  }

  function setConfigForm(page, config) {
    configFields.forEach((field) => {
      const input = page.querySelector(`#${field}`);
      if (!input) return;
      const value = configValue(config, field);
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else {
        input.value = value ?? '';
        input.dispatchEvent(new CustomEvent('valueset'));
      }
    });

    const apiKeyInput = page.querySelector('#SeerrApiKey');
    const clearApiKeyInput = page.querySelector('#ClearSeerrApiKey');
    const apiKeyStatus = page.querySelector('#SeerrApiKeyStatus');
    if (apiKeyInput) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = config.SeerrApiKeyConfigured ? 'Stored key configured' : 'Paste Seerr API key';
      apiKeyInput.dispatchEvent(new CustomEvent('valueset'));
    }

    if (clearApiKeyInput) {
      clearApiKeyInput.checked = false;
    }

    if (apiKeyStatus) {
      apiKeyStatus.textContent = config.SeerrApiKeyConfigured
        ? 'A Seerr API key is configured. Leave blank to keep it, or paste a new key to replace it.'
        : 'No Seerr API key is configured. Paste a key before using Discover.';
    }

    page.__seerrExtraRails = (configValue(config, 'ExtraRails') || []).map(normalizeConfigRail).filter((rail) => rail.Id && rail.Title);
    renderConfigExtraRails(page);
    enforceConfigRailMediaType(page);
  }

  function applyConfigForm(page, config) {
    configFields.forEach((field) => {
      const input = page.querySelector(`#${field}`);
      if (!input) return;
      if (input.type === 'checkbox') {
        assignConfigValue(config, field, input.checked);
      } else if (input.type === 'number') {
        assignConfigValue(config, field, Number.parseInt(input.value || '0', 10));
      } else {
        assignConfigValue(config, field, input.value);
      }
    });

    assignConfigValue(config, 'SeerrApiKey', page.querySelector('#SeerrApiKey')?.value || '');
    assignConfigValue(config, 'ClearSeerrApiKey', !!page.querySelector('#ClearSeerrApiKey')?.checked);
    assignConfigValue(config, 'ExtraRails', (page.__seerrExtraRails || []).map((rail) => ({
      Id: rail.Id,
      Kind: rail.Kind,
      MediaType: rail.MediaType,
      Value: rail.Value,
      Title: rail.Title,
      Enabled: rail.Enabled,
    })));
    return config;
  }

  function loadConfigPage(page) {
    showConfigLoading();
    apiFetch('/SeerrDiscover/config')
      .then((config) => {
        setConfigForm(page, config);
        hideConfigLoading();
      })
      .catch((error) => {
        hideConfigLoading();
        showConfigAlert(`Failed to load Seerr Discover configuration: ${error.message || error}`);
      });
  }

  function saveConfigPage(page) {
    showConfigLoading();
    apiFetch('/SeerrDiscover/config')
      .then((config) => apiFetch('/SeerrDiscover/config', {
        method: 'POST',
        body: JSON.stringify(applyConfigForm(page, config)),
      }))
      .then((config) => {
        setConfigForm(page, config);
        state.clientConfig = null;
        state.clientConfigPromise = null;
        hideConfigLoading();
        if (window.Dashboard && typeof window.Dashboard.processPluginConfigurationUpdateResult === 'function') {
          window.Dashboard.processPluginConfigurationUpdateResult(config);
        } else {
          showToast('Settings saved.', 'success');
        }
      })
      .catch((error) => {
        hideConfigLoading();
        showConfigAlert(`Failed to save Seerr Discover configuration: ${error.message || error}`);
      });
  }

  function showConfigLoading() {
    if (window.Dashboard && typeof window.Dashboard.showLoadingMsg === 'function') {
      window.Dashboard.showLoadingMsg();
    }
  }

  function hideConfigLoading() {
    if (window.Dashboard && typeof window.Dashboard.hideLoadingMsg === 'function') {
      window.Dashboard.hideLoadingMsg();
    }
  }

  function showConfigAlert(message) {
    if (window.Dashboard && typeof window.Dashboard.alert === 'function') {
      window.Dashboard.alert({ message });
      return;
    }
    showToast(message, 'error', { timeout: 7000 });
  }

  function normalizeConfigToken(value) {
    return String(value || '').trim().toLowerCase();
  }

  function configMediaLabel(mediaType) {
    return mediaType === 'tv' ? 'TV' : 'Movies';
  }

  function configRailId(kind, mediaType, value) {
    const normalizedKind = normalizeConfigToken(kind);
    const normalizedMediaType = normalizeConfigToken(mediaType);
    const normalizedValue = normalizedKind === 'language'
      ? normalizeConfigToken(value).replace(/[^a-z0-9-]/g, '')
      : normalizeConfigToken(value).replace(/\D/g, '');
    return `${normalizedKind}-${normalizedMediaType}-${normalizedValue}`;
  }

  function normalizeConfigRail(rail) {
    const kind = normalizeConfigToken(rail.Kind || rail.kind);
    const mediaType = normalizeConfigToken(rail.MediaType || rail.mediaType);
    const value = String(rail.Value || rail.value || '').trim();
    const id = configRailId(kind, mediaType, value);
    return {
      Id: id,
      Kind: kind,
      MediaType: mediaType,
      Value: kind === 'language' ? normalizeConfigToken(value) : value.replace(/\D/g, ''),
      Title: String(rail.Title || rail.title || '').trim(),
      Enabled: !!(rail.Enabled ?? rail.enabled),
    };
  }

  function configOptionItems(payload) {
    if (Array.isArray(payload)) return payload;
    return Array.isArray(payload?.results) ? payload.results : [];
  }

  function configOptionValue(option) {
    return String(option.id ?? option.iso_639_1 ?? option.value ?? '');
  }

  function configOptionName(option) {
    return String(option.name || option.english_name || option.englishName || configOptionValue(option));
  }

  function configOptionTitle(kind, mediaType, option) {
    return `${configOptionName(option)} ${configMediaLabel(mediaType)}`;
  }

  function enforceConfigRailMediaType(page) {
    const kindInput = page.querySelector('#ExtraRailKind');
    const mediaTypeInput = page.querySelector('#ExtraRailMediaType');
    if (!kindInput || !mediaTypeInput) return;

    if (kindInput.value === 'studio') {
      mediaTypeInput.value = 'movie';
      mediaTypeInput.disabled = true;
    } else if (kindInput.value === 'network') {
      mediaTypeInput.value = 'tv';
      mediaTypeInput.disabled = true;
    } else {
      mediaTypeInput.disabled = false;
    }
  }

  function renderConfigExtraRails(page) {
    const list = page.querySelector('#ExtraRailList');
    if (!list) return;

    const extraRails = page.__seerrExtraRails || [];
    if (!extraRails.length) {
      list.innerHTML = '<p>No optional rails configured.</p>';
      return;
    }

    list.innerHTML = extraRails.map((rail) => `
      <div class="seerr-config-extra-rail" data-extra-rail="${escapeHtml(rail.Id)}">
        <label class="emby-checkbox-label">
          <input type="checkbox" is="emby-checkbox" data-extra-rail-enabled="${escapeHtml(rail.Id)}" ${rail.Enabled ? 'checked' : ''} />
          <span class="seerr-config-extra-rail-title">${escapeHtml(rail.Title)}</span>
        </label>
        <button is="emby-button" type="button" class="emby-button seerr-config-remove-button" data-extra-rail-remove="${escapeHtml(rail.Id)}">
          <span>Remove</span>
        </button>
      </div>
    `).join('');

    list.querySelectorAll('[data-extra-rail-enabled]').forEach((input) => {
      input.addEventListener('change', () => {
        const rail = extraRails.find((item) => item.Id === input.getAttribute('data-extra-rail-enabled'));
        if (rail) rail.Enabled = input.checked;
      });
    });

    list.querySelectorAll('[data-extra-rail-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-extra-rail-remove');
        page.__seerrExtraRails = extraRails.filter((rail) => rail.Id !== id);
        renderConfigExtraRails(page);
      });
    });
  }

  function addConfigExtraRail(page, kind, mediaType, option) {
    const value = configOptionValue(option);
    const id = configRailId(kind, mediaType, value);
    const extraRails = page.__seerrExtraRails || [];
    if (!id || extraRails.some((rail) => rail.Id === id)) return;

    extraRails.push({
      Id: id,
      Kind: normalizeConfigToken(kind),
      MediaType: normalizeConfigToken(mediaType),
      Value: normalizeConfigToken(kind) === 'language' ? normalizeConfigToken(value) : value.replace(/\D/g, ''),
      Title: configOptionTitle(kind, mediaType, option),
      Enabled: true,
    });
    page.__seerrExtraRails = extraRails;
    renderConfigExtraRails(page);
  }

  function renderConfigRailOptions(page, kind, mediaType, payload, query) {
    const options = page.querySelector('#ExtraRailOptions');
    if (!options) return;

    const needle = normalizeConfigToken(query);
    const items = configOptionItems(payload)
      .filter((item) => configOptionValue(item))
      .filter((item) => !needle || normalizeConfigToken(configOptionName(item)).includes(needle))
      .slice(0, 12);

    if (!items.length) {
      options.innerHTML = '<p>No matching rail options.</p>';
      return;
    }

    options.innerHTML = items.map((item, index) => `
      <button is="emby-button" type="button" class="emby-button seerr-config-option-button" data-rail-option-index="${index}">
        <span>Add ${escapeHtml(configOptionTitle(kind, mediaType, item))}</span>
      </button>
    `).join('');

    options.querySelectorAll('[data-rail-option-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items[Number.parseInt(button.getAttribute('data-rail-option-index') || '0', 10)];
        addConfigExtraRail(page, kind, mediaType, item);
      });
    });
  }

  function searchConfigRailOptions(page) {
    enforceConfigRailMediaType(page);
    const kind = page.querySelector('#ExtraRailKind')?.value || 'genre';
    const mediaType = page.querySelector('#ExtraRailMediaType')?.value || 'movie';
    const query = page.querySelector('#ExtraRailQuery')?.value || '';
    const options = page.querySelector('#ExtraRailOptions');
    if (options) options.textContent = 'Loading...';

    const requiresQuery = kind === 'studio' || kind === 'keyword';
    if (requiresQuery && !query.trim()) {
      if (options) options.innerHTML = '<p>Enter a search term first.</p>';
      return;
    }

    const params = new URLSearchParams({ kind, mediaType });
    if (query.trim()) params.set('query', query.trim());
    apiFetch(`/SeerrDiscover/rail-options?${params.toString()}`)
      .then((payload) => renderConfigRailOptions(page, kind, mediaType, payload, query))
      .catch((error) => {
        if (options) options.textContent = `Failed to load rail options: ${error.message || error}`;
      });
  }

  function scheduleMount() {
    window.setTimeout(mount, 50);
    window.setTimeout(mount, 350);
    window.setTimeout(mount, 1000);
    scheduleNativeSearchAttach();
    window.setTimeout(scheduleDiscoverSpacing, 80);
    window.setTimeout(scheduleDiscoverSpacing, 400);
    window.setTimeout(scheduleDiscoverSpacing, 1100);
    window.setTimeout(() => maybeStartJellyfinPlayback(), 350);
    window.setTimeout(() => maybeStartJellyfinPlayback(), 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount);
  } else {
    scheduleMount();
  }
  window.SeerrDiscoverInitializeConfigPage = initializeConfigPage;
  window.addEventListener('hashchange', () => {
    closeModal();
    removeNativeSearchSection();
    scheduleMount();
  });
  window.addEventListener('popstate', () => {
    removeNativeSearchSection();
    scheduleMount();
  });
  window.addEventListener('resize', scheduleDiscoverSpacing);
  window.addEventListener('orientationchange', scheduleDiscoverSpacing);
  document.addEventListener('click', (event) => {
    const button = event.target && event.target.closest ? event.target.closest('button') : null;
    if (button && button.closest('.emby-tabs-slider')) {
      scheduleMount();
    }
  }, true);
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
})();
