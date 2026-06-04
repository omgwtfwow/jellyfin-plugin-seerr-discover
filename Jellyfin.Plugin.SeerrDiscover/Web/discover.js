(function () {
  'use strict';

  const rootSelector = '#seerrDiscoverRoot';
  const styleId = 'seerr-discover-style';
  const state = {
    mountedRoot: null,
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

  const rails = [
    { id: 'trending', title: 'Trending', feed: 'trending' },
    { id: 'movies', title: 'Popular Movies', feed: 'movies' },
    { id: 'tv', title: 'Popular TV', feed: 'tv' },
    { id: 'upcoming', title: 'Upcoming', feed: 'upcoming' },
  ];

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
        margin-top: var(--seerr-content-overlap-offset, 0px);
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
        --seerr-tab-top-offset-fallback: calc(clamp(5.2rem, 8.5vh, 7rem) + env(safe-area-inset-top));
        box-sizing: border-box;
        min-height: 100%;
        padding:
          env(safe-area-inset-top)
          max(clamp(0.75rem, 1.5vw, 1.25rem), env(safe-area-inset-right))
          calc(clamp(1.6rem, 4vh, 3rem) + env(safe-area-inset-bottom))
          max(clamp(0.75rem, 1.5vw, 1.25rem), env(safe-area-inset-left));
      }
      .seerr-discover-tab-content[data-seerr-pane-source="fallback"] {
        padding-top: var(--seerr-tab-top-offset-fallback);
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
        border: 1px solid rgb(var(--seerr-primary-channel) / 0.5);
        background: rgb(var(--seerr-primary-channel) / 0.18);
        color: var(--seerr-text);
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
        background: var(--seerr-card-placeholder);
        box-shadow: inset 0 0 0 1px var(--seerr-border-soft);
      }
      .seerr-card__image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
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
        width: min(68rem, 96vw);
        max-height: 88vh;
        overflow: auto;
        border-radius: 0.65rem;
        background: var(--seerr-surface);
        color: var(--seerr-text);
        box-shadow: 0 1.6rem 5rem rgb(var(--seerr-bg-channel) / 0.46);
      }
      .seerr-modal__hero {
        min-height: 16rem;
        background-position: center;
        background-size: cover;
        position: relative;
      }
      .seerr-modal__hero::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgb(var(--seerr-surface-channel) / 0.08), var(--seerr-surface) 92%);
      }
      .seerr-modal__body {
        display: grid;
        grid-template-columns: 11.5rem minmax(0, 1fr);
        gap: 1.15rem;
        padding: 0 1.35rem 1.35rem;
        margin-top: -5.8rem;
        position: relative;
        z-index: 1;
      }
      .seerr-modal__poster {
        aspect-ratio: 2 / 3;
        border-radius: 0.5rem;
        overflow: hidden;
        background: var(--seerr-hover);
        box-shadow: 0 0.8rem 1.8rem rgb(var(--seerr-bg-channel) / 0.32);
      }
      .seerr-modal__poster img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .seerr-modal__content {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.72rem;
      }
      .seerr-modal__content h2 {
        margin: 0;
        font-size: 1.65rem;
        letter-spacing: 0;
      }
      .seerr-modal__tagline {
        margin: 0;
        color: var(--seerr-muted);
        font-style: italic;
        line-height: 1.35;
      }
      .seerr-modal__overview {
        margin: 0;
        color: var(--seerr-muted);
        line-height: 1.45;
      }
      .seerr-modal__actions {
        display: flex;
        gap: 0.55rem;
        flex-wrap: wrap;
        align-items: stretch;
        margin: 0.1rem 0 0.25rem;
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
        color: var(--seerr-text);
      }
      .seerr-modal__rating strong {
        font-size: 1.05rem;
      }
      .seerr-modal__rating span {
        color: var(--seerr-muted);
        font-size: 0.78rem;
      }
      .seerr-modal__facts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.55rem 1rem;
        border-top: 1px solid var(--seerr-border-soft);
        border-bottom: 1px solid var(--seerr-border-soft);
        padding: 0.78rem 0;
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
        gap: 0.75rem 1rem;
      }
      .seerr-modal__section {
        margin-top: 0.85rem;
      }
      .seerr-modal__section h3 {
        margin: 0 0 0.45rem;
        font-size: 0.95rem;
        font-weight: 650;
        letter-spacing: 0;
      }
      .seerr-modal__person-list {
        display: grid;
        gap: 0.42rem;
      }
      .seerr-modal__person {
        min-width: 0;
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
      .seerr-modal__close {
        position: absolute;
        top: 0.7rem;
        right: 0.7rem;
        z-index: 2;
        width: 2.25rem;
        height: 2.25rem;
        border: 0;
        border-radius: 50%;
        background: rgb(var(--seerr-bg-channel) / 0.5);
        color: var(--seerr-text);
        font-size: 1.35rem;
        cursor: pointer;
      }
      @media (max-width: 720px) {
        .seerr-discover-tab-content {
          --seerr-tab-top-offset-fallback: calc(clamp(4.7rem, 9vh, 6rem) + env(safe-area-inset-top));
          padding:
            env(safe-area-inset-top)
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
        .seerr-modal__hero { min-height: 12rem; }
        .seerr-modal__body { grid-template-columns: 1fr; margin-top: -4rem; }
        .seerr-modal__poster { width: 9rem; }
        .seerr-modal__actions > .seerr-discover__button,
        .seerr-modal__trailer-menu { flex: 1 1 auto; }
        .seerr-modal__trailer-menu,
        .seerr-modal__trailer-split { width: 100%; }
        .seerr-modal__trailer-main { flex: 1 1 auto; }
        .seerr-modal__trailer-list { left: 0; right: 0; min-width: 100%; }
        .seerr-modal__facts,
        .seerr-modal__people { grid-template-columns: 1fr; }
        .seerr-modal__keywords { display: none; }
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

  function visibleBottom(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) return null;
    return rect.bottom;
  }

  function updateDiscoverSpacing() {
    const button = discoverTabButton();
    const pane = markDiscoverPane() || discoverTabPane(button);
    if (!pane) return;

    const candidates = [
      button,
      button?.closest('.emby-tabs-slider'),
      button?.closest('.emby-tabs'),
      button?.closest('[class*="tabs"]'),
    ].map(visibleBottom).filter((bottom) => bottom !== null);

    const content = pane.querySelector('.seerr-discover');
    if (!content) return;

    if (!candidates.length) {
      content.style.setProperty('--seerr-content-overlap-offset', '0px');
      return;
    }

    const currentOffset = Number.parseFloat(content.style.getPropertyValue('--seerr-content-overlap-offset')) || 0;
    const contentTop = (content.getBoundingClientRect().top || 0) - currentOffset;
    const spacing = window.innerWidth <= 720 ? 18 : 20;
    const measured = Math.max(0, Math.ceil(Math.max(...candidates) - contentTop + spacing));
    content.style.setProperty('--seerr-content-overlap-offset', `${measured}px`);
  }

  function scheduleDiscoverSpacing() {
    window.cancelAnimationFrame(spacingFrame);
    spacingFrame = window.requestAnimationFrame(() => {
      updateDiscoverSpacing();
      window.setTimeout(updateDiscoverSpacing, 120);
      window.setTimeout(updateDiscoverSpacing, 450);
    });
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
    const poster = tmdbImage(item.posterPath || item.backdropPath, 'w342');
    const typeLabel = mediaType(item) === 'tv' ? 'Series' : 'Movie';
    const status = cardStatusLabel(item);
    const year = (mediaDate(item) || '').slice(0, 4);
    const badgeClass = cardBadgeClass(status);
    return `
      <button class="seerr-card" data-seerr-type="${escapeHtml(mediaType(item))}" data-seerr-id="${escapeHtml(item.id)}">
        <span class="seerr-card__image">
          ${poster ? `<img loading="lazy" src="${escapeHtml(poster)}" alt="">` : ''}
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

    const meNotice = state.me && state.me.mapped === false
      ? '<div class="seerr-discover__notice">This Jellyfin user is not linked in Seerr, so requests are disabled. Open Seerr once or import Jellyfin users in Seerr.</div>'
      : '';
    const error = state.error ? `<div class="seerr-discover__notice">${escapeHtml(state.error)}</div>` : '';

    root.innerHTML = `
      <div class="seerr-discover">
        ${meNotice}
        ${error}
        <div data-seerr-rails>
          ${rails.map((rail) => railTemplate(rail, root.__seerrRailData?.[rail.id] || [])).join('')}
        </div>
      </div>
    `;
    bindRoot(root);
    scheduleDiscoverSpacing();
  }

  function bindRoot(root) {
    root.querySelectorAll('[data-seerr-id]').forEach((button) => {
      button.addEventListener('click', () => openDetails(button.getAttribute('data-seerr-type'), button.getAttribute('data-seerr-id')));
    });
  }

  function renderModal(detail) {
    closeModal();
    const type = mediaType(detail);
    const backdrop = tmdbImage(detail.backdropPath || detail.posterPath, 'w1280');
    const poster = tmdbImage(detail.posterPath || detail.backdropPath, 'w342');
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
    const actions = available
      ? availableActions(jellyfinDetailUrl, jellyfinWatchUrl, seerrUrl)
      : requested
        ? requestedActions(seerrUrl)
      : requestActions(requestDisabled, mapped, seerrUrl);
    const tagline = detail.tagline ? `<p class="seerr-modal__tagline">${escapeHtml(detail.tagline)}</p>` : '';
    const rating = ratingTemplate(detail);
    const metaSection = meta.length
      ? `<div class="seerr-modal__meta">${meta.map((value) => `<span class="seerr-modal__chip">${escapeHtml(value)}</span>`).join('')}</div>`
      : '';
    const factsSection = facts.length
      ? `<div class="seerr-modal__facts">
          ${facts.map((fact) => `<div><div class="seerr-modal__fact-label">${escapeHtml(fact.label)}</div><div class="seerr-modal__fact-value">${escapeHtml(fact.value)}</div></div>`).join('')}
        </div>`
      : '';
    const peopleSection = people.length
      ? `<div class="seerr-modal__people">
          ${people.map((group) => `<section class="seerr-modal__section">
            <h3>${escapeHtml(group.title)}</h3>
            <div class="seerr-modal__person-list">
              ${group.items.map((person) => `<div class="seerr-modal__person"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.detail)}</span></div>`).join('')}
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
    modal.innerHTML = `
      <div class="seerr-modal__panel" role="dialog" aria-modal="true">
        <button class="seerr-modal__close" type="button" aria-label="Close">&times;</button>
        <div class="seerr-modal__hero" style="${backdrop ? `background-image:url('${escapeHtml(backdrop)}')` : ''}"></div>
        <div class="seerr-modal__body">
          <div class="seerr-modal__poster">${poster ? `<img src="${escapeHtml(poster)}" alt="">` : ''}</div>
          <div class="seerr-modal__content">
            <h2>${escapeHtml(mediaTitle(detail))}</h2>
            <p class="seerr-card__date">${escapeHtml(type.toUpperCase())} ${escapeHtml((mediaDate(detail) || '').slice(0, 4))} · ${escapeHtml(statusLabel(detail))}</p>
            ${tagline}
            ${rating}
            ${metaSection}
            <div class="seerr-modal__actions">
              ${actions}
              ${trailerAction}
            </div>
            <p class="seerr-modal__overview">${escapeHtml(detail.overview || 'No overview available.')}</p>
            ${factsSection}
            ${peopleSection}
            ${keywordSection}
          </div>
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
  }

  function requestActions(requestDisabled, mapped, seerrUrl) {
    return [
      `<button class="seerr-discover__button emby-button" type="button" data-seerr-request ${requestDisabled ? 'disabled' : ''}>${escapeHtml(mapped ? 'Request' : 'Not linked')}</button>`,
      seerrAction(seerrUrl),
    ].join('');
  }

  function availableActions(detailUrl, watchUrl, seerrUrl) {
    if (!detailUrl && !watchUrl && !seerrUrl) {
      return '<button class="seerr-discover__button emby-button" type="button" disabled>Available</button>';
    }

    return [
      !detailUrl && !watchUrl ? '<button class="seerr-discover__button emby-button" type="button" disabled>Available</button>' : '',
      watchUrl ? `<a class="seerr-discover__button emby-button" href="${escapeHtml(watchUrl)}">Watch Now</a>` : '',
      detailUrl ? `<a class="seerr-discover__button emby-button seerr-discover__button--secondary" href="${escapeHtml(detailUrl)}">Open Details</a>` : '',
      seerrAction(seerrUrl),
    ].join('');
  }

  function requestedActions(seerrUrl) {
    return [
      '<button class="seerr-discover__button emby-button" type="button" disabled>Requested</button>',
      seerrAction(seerrUrl),
    ].join('');
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
      .map((person) => ({ name: person.name, detail: person.character || 'Cast' }));
    const crew = prioritizedCrew(detail).slice(0, 3);

    if (cast.length) groups.push({ title: 'Cast', items: cast });
    if (crew.length) groups.push({ title: 'Crew', items: crew });
    return groups;
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

    ((detail.createdBy || [])).forEach((person) => addCrew(people, seen, person?.name, 'Creator'));
    const crew = ((detail.credits && detail.credits.crew) || []).filter((person) => person?.name);
    const priorities = ['Director', 'Creator', 'Writer', 'Screenplay'];
    priorities.forEach((job) => {
      crew.filter((person) => String(person.job || '').toLowerCase() === job.toLowerCase())
        .forEach((person) => addCrew(people, seen, person.name, person.job));
    });

    crew
      .filter((person) => ['Directing', 'Writing'].includes(person.department))
      .forEach((person) => addCrew(people, seen, person.name, person.job || person.department));

    return people;
  }

  function addCrew(items, seen, name, detail) {
    if (!name) return;
    const key = `${name}:${detail || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ name, detail: detail || 'Crew' });
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

  function ensureNativeSearchEnabled() {
    if (nativeSearch.enabled !== null) {
      return Promise.resolve(nativeSearch.enabled);
    }

    if (!nativeSearch.enabledPromise) {
      nativeSearch.enabledPromise = apiFetch('/SeerrDiscover/client-config')
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

    const resultsContainer = page.querySelector('.searchResults, [class*="searchResults"], .padded-top.padded-bottom-page');
    if (resultsContainer) {
      resultsContainer.appendChild(section);
      return false;
    }

    const noResultsMessage = page.querySelector('.noItemsMessage');
    if (noResultsMessage?.parentElement) {
      noResultsMessage.classList.add('hide');
      noResultsMessage.setAttribute('data-seerr-hidden-no-results', 'true');
      noResultsMessage.parentElement.insertBefore(section, noResultsMessage.nextSibling);
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
    return Promise.all(rails.map((rail) => {
      return apiFetch(`/SeerrDiscover/discover?feed=${encodeURIComponent(rail.feed)}&page=1`)
        .then((data) => filterAndEnrichItems(data.results))
        .then((items) => { root.__seerrRailData[rail.id] = items; })
        .catch((error) => {
          root.__seerrRailData[rail.id] = [];
          console.warn('Seerr Discover rail failed', rail.id, error);
        });
    })).then(render);
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
    ensureCustomTabRoot();
    const root = document.querySelector(rootSelector);
    if (!root) {
      state.mountedRoot = null;
      return;
    }
    if (state.mountedRoot === root && root.__seerrMounted) return;
    root.__seerrMounted = true;
    root.__seerrRailData = {};
    render();
    Promise.all([loadMe(), loadRails()]).then(render).catch((error) => setError(error.message || String(error)));
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
