export default class SeerrDiscoverConfigPageController {
  constructor(view) {
    initializeConfigPage(view);
  }
}

const artworkLayoutVertical = 'vertical';
const artworkLayoutHorizontal = 'horizontal';

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

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function normalizeArtworkLayout(value) {
  return String(value || '').trim().toLowerCase() === artworkLayoutHorizontal
    ? artworkLayoutHorizontal
    : artworkLayoutVertical;
}

function showConfigSaved() {
  const dashboard = currentDashboard();
  if (dashboard && typeof dashboard.toast === 'function') {
    dashboard.toast('Settings saved.');
  }
}

function initializeConfigPage(configPage) {
  const page = configPage || document.querySelector('#SeerrDiscoverConfigPage');
  if (!page || page.dataset.seerrConfigControllerLoaded === 'true') return;
  page.dataset.seerrConfigControllerLoaded = 'true';
  page.__seerrExtraRails = [];
  page.__seerrDiscoverRailEnabled = {};
  page.__seerrDetailRailEnabled = {};
  page.__seerrDiscoverRailPresentation = [];
  page.__seerrDetailRailPresentation = [];

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
];

const configDiscoverRailDefinitions = [
  { Id: 'trending-movies', Title: 'Trending Movies', EnableField: 'EnableTrendingMovies' },
  { Id: 'trending-tv', Title: 'Trending TV', EnableField: 'EnableTrendingTv' },
  { Id: 'movies', Title: 'Popular Movies', EnableField: 'EnableMovies' },
  { Id: 'tv', Title: 'Popular TV', EnableField: 'EnableTv' },
  { Id: 'upcoming', Title: 'Upcoming Movies', EnableField: 'EnableUpcoming' },
  { Id: 'upcoming-tv', Title: 'Upcoming TV', EnableField: 'EnableUpcomingTv' },
  { Id: 'recently-requested', Title: 'Recently Requested', EnableField: 'EnableRecentlyRequested' },
  { Id: 'server-popular', Title: 'Popular With This Server', EnableField: 'EnablePopularWithServer' },
];

const configDetailRailDefinitions = [
  { Id: 'similar', Title: 'Similar', EnableField: 'EnableDetailSimilar' },
  { Id: 'recommended', Title: 'Recommended', EnableField: 'EnableDetailRecommended' },
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
  page.__seerrDiscoverRailEnabled = configDiscoverRailDefinitions.reduce((enabled, rail) => ({
    ...enabled,
    [rail.Id]: !!configValue(config, rail.EnableField),
  }), {});
  page.__seerrDetailRailEnabled = configDetailRailDefinitions.reduce((enabled, rail) => ({
    ...enabled,
    [rail.Id]: !!configValue(config, rail.EnableField),
  }), {});
  page.__seerrDiscoverRailPresentation = normalizeConfigRailPresentation(
    configValue(config, 'DiscoverRailPresentation') || [],
    configDiscoverRows(page).map((rail) => rail.Id)
  );
  page.__seerrDetailRailPresentation = normalizeConfigRailPresentation(
    configValue(config, 'DetailRailPresentation') || [],
    configDetailRailDefinitions.map((rail) => rail.Id)
  );
  renderConfigRailLists(page);
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
  configDiscoverRailDefinitions.forEach((rail) => {
    assignConfigValue(config, rail.EnableField, !!(page.__seerrDiscoverRailEnabled || {})[rail.Id]);
  });
  configDetailRailDefinitions.forEach((rail) => {
    assignConfigValue(config, rail.EnableField, !!(page.__seerrDetailRailEnabled || {})[rail.Id]);
  });
  assignConfigValue(config, 'DiscoverRailPresentation', (page.__seerrDiscoverRailPresentation || []).map((rail) => ({
    Id: rail.Id,
    ArtworkLayout: normalizeConfigArtworkLayout(rail.ArtworkLayout),
    Title: normalizeConfigRailTitle(rail.Title),
  })));
  assignConfigValue(config, 'DetailRailPresentation', (page.__seerrDetailRailPresentation || []).map((rail) => ({
    Id: rail.Id,
    ArtworkLayout: normalizeConfigArtworkLayout(rail.ArtworkLayout),
    Title: normalizeConfigRailTitle(rail.Title),
  })));
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
      window.dispatchEvent(new CustomEvent('seerrdiscoverconfigchanged'));
      hideConfigLoading();
      const dashboard = currentDashboard();
      if (dashboard && typeof dashboard.processPluginConfigurationUpdateResult === 'function') {
        dashboard.processPluginConfigurationUpdateResult(config);
      } else {
        showConfigSaved();
      }
    })
    .catch((error) => {
      hideConfigLoading();
      showConfigAlert(`Failed to save Seerr Discover configuration: ${error.message || error}`);
    });
}

function showConfigLoading() {
  const dashboard = currentDashboard();
  if (dashboard && typeof dashboard.showLoadingMsg === 'function') {
    dashboard.showLoadingMsg();
  }
}

function hideConfigLoading() {
  const dashboard = currentDashboard();
  if (dashboard && typeof dashboard.hideLoadingMsg === 'function') {
    dashboard.hideLoadingMsg();
  }
}

function showConfigAlert(message) {
  const dashboard = currentDashboard();
  if (dashboard && typeof dashboard.alert === 'function') {
    dashboard.alert({ message });
    return;
  }
  console.error(message);
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

function normalizeConfigArtworkLayout(value) {
  return normalizeArtworkLayout(value);
}

function normalizeConfigRailTitle(value) {
  return String(value || '').trim().slice(0, 96);
}

function normalizeConfigRailPresentation(presentation, knownIds) {
  const ids = (knownIds || []).map(normalizeConfigToken).filter(Boolean);
  const normalized = [];
  const seen = new Set();
  (Array.isArray(presentation) ? presentation : []).forEach((item) => {
    const id = normalizeConfigToken(item.Id || item.id);
    if (!ids.includes(id) || seen.has(id)) return;
    seen.add(id);
    normalized.push({
      Id: id,
      ArtworkLayout: normalizeConfigArtworkLayout(item.ArtworkLayout || item.artworkLayout),
      Title: normalizeConfigRailTitle(item.Title || item.title),
    });
  });

  ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    normalized.push({ Id: id, ArtworkLayout: artworkLayoutVertical, Title: '' });
  });
  return normalized;
}

function configDiscoverRows(page) {
  return [
    ...configDiscoverRailDefinitions.map((rail) => ({ ...rail, IsExtra: false })),
    ...((page.__seerrExtraRails || []).map((rail) => ({
      Id: rail.Id,
      Title: rail.Title,
      IsExtra: true,
      ExtraRail: rail,
    }))),
  ];
}

function configRailPresentationItem(page, property, id) {
  return (page[property] || []).find((item) => item.Id === id);
}

function setConfigRailLayout(page, property, id, value) {
  const item = configRailPresentationItem(page, property, id);
  if (item) item.ArtworkLayout = normalizeConfigArtworkLayout(value);
}

function setConfigRailTitle(page, property, id, value) {
  const item = configRailPresentationItem(page, property, id);
  if (item) item.Title = normalizeConfigRailTitle(value);
}

function moveConfigRail(page, property, id, direction) {
  const presentation = page[property] || [];
  const index = presentation.findIndex((item) => item.Id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= presentation.length) return;
  const next = [...presentation];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  page[property] = next;
  renderConfigRailLists(page);
}

function renderConfigRailLists(page) {
  renderConfigRailList(
    page,
    '#DiscoverRailList',
    configDiscoverRows(page),
    '__seerrDiscoverRailPresentation',
    '__seerrDiscoverRailEnabled'
  );
  renderConfigRailList(
    page,
    '#DetailRailList',
    configDetailRailDefinitions.map((rail) => ({ ...rail, IsExtra: false })),
    '__seerrDetailRailPresentation',
    '__seerrDetailRailEnabled'
  );
}

function renderConfigRailList(page, selector, rows, presentationProperty, enabledProperty) {
  const list = page.querySelector(selector);
  if (!list) return;
  const byId = new Map(rows.map((row) => [row.Id, row]));
  page[presentationProperty] = normalizeConfigRailPresentation(page[presentationProperty], rows.map((row) => row.Id));
  const orderedRows = page[presentationProperty]
    .map((presentation) => {
      const definition = byId.get(presentation.Id);
      if (!definition) return null;
      const title = normalizeConfigRailTitle(presentation.Title);
      return {
        ...definition,
        ArtworkLayout: presentation.ArtworkLayout,
        TitleOverride: title,
        DisplayTitle: definition.Title,
      };
    })
    .filter(Boolean)
    .filter((row) => row.Id);

  if (!orderedRows.length) {
    list.innerHTML = '<p>No rails configured.</p>';
    return;
  }

  list.innerHTML = orderedRows.map((row, index) => {
    const enabled = row.IsExtra ? !!row.ExtraRail.Enabled : !!(page[enabledProperty] || {})[row.Id];
    return `
      <div class="seerr-config-rail-row" data-config-rail-id="${escapeHtml(row.Id)}">
        <label class="emby-checkbox-label seerr-config-rail-enabled">
          <input type="checkbox" is="emby-checkbox" data-config-rail-enabled="${escapeHtml(row.Id)}" ${enabled ? 'checked' : ''} />
          <span class="seerr-config-rail-title" data-config-rail-display-title="${escapeHtml(row.Id)}">${escapeHtml(row.DisplayTitle)}</span>
        </label>
        <div class="inputContainer seerr-config-rail-heading">
          <label class="inputLabel inputLabelUnfocused" for="RailTitle-${escapeHtml(row.Id)}">Heading</label>
          <input id="RailTitle-${escapeHtml(row.Id)}" is="emby-input" type="text" maxlength="96" value="${escapeHtml(row.TitleOverride)}" placeholder="${escapeHtml(row.Title)}" data-config-rail-title="${escapeHtml(row.Id)}" aria-label="${escapeHtml(row.Title)} custom heading" />
        </div>
        <label class="emby-checkbox-label seerr-config-rail-layout">
          <input type="checkbox" is="emby-checkbox" data-config-rail-layout="${escapeHtml(row.Id)}" aria-label="${escapeHtml(row.Title)} horizontal landscape layout" ${row.ArtworkLayout === artworkLayoutHorizontal ? 'checked' : ''} />
          <span>Horizontal landscape</span>
        </label>
        <button is="emby-button" type="button" class="emby-button seerr-config-row-button seerr-config-row-button--up" data-config-rail-move="${escapeHtml(row.Id)}" data-config-rail-direction="-1" ${index === 0 ? 'disabled' : ''}>
          <span>Move up</span>
        </button>
        <button is="emby-button" type="button" class="emby-button seerr-config-row-button seerr-config-row-button--down" data-config-rail-move="${escapeHtml(row.Id)}" data-config-rail-direction="1" ${index === orderedRows.length - 1 ? 'disabled' : ''}>
          <span>Move down</span>
        </button>
        ${row.IsExtra ? `<button is="emby-button" type="button" class="emby-button seerr-config-row-button seerr-config-row-button--remove" data-extra-rail-remove="${escapeHtml(row.Id)}"><span>Remove</span></button>` : ''}
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-config-rail-enabled]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-config-rail-enabled') || '';
      const row = byId.get(id);
      if (row?.IsExtra) {
        row.ExtraRail.Enabled = input.checked;
      } else {
        page[enabledProperty] = { ...(page[enabledProperty] || {}), [id]: input.checked };
      }
    });
  });

  list.querySelectorAll('[data-config-rail-layout]').forEach((input) => {
    input.addEventListener('change', () => {
      setConfigRailLayout(page, presentationProperty, input.getAttribute('data-config-rail-layout') || '', input.checked ? artworkLayoutHorizontal : artworkLayoutVertical);
    });
  });

  list.querySelectorAll('[data-config-rail-title]').forEach((input) => {
    input.addEventListener('input', () => {
      const id = input.getAttribute('data-config-rail-title') || '';
      const value = normalizeConfigRailTitle(input.value);
      const row = byId.get(id);
      setConfigRailTitle(page, presentationProperty, id, value);
      const label = Array.from(list.querySelectorAll('[data-config-rail-display-title]'))
        .find((element) => element.getAttribute('data-config-rail-display-title') === id);
      if (label && row) {
        label.textContent = row.Title;
      }
    });
  });

  list.querySelectorAll('[data-config-rail-move]').forEach((button) => {
    button.addEventListener('click', () => {
      moveConfigRail(
        page,
        presentationProperty,
        button.getAttribute('data-config-rail-move') || '',
        Number.parseInt(button.getAttribute('data-config-rail-direction') || '0', 10)
      );
    });
  });

  list.querySelectorAll('[data-extra-rail-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-extra-rail-remove') || '';
      page.__seerrExtraRails = (page.__seerrExtraRails || []).filter((rail) => rail.Id !== id);
      page.__seerrDiscoverRailPresentation = (page.__seerrDiscoverRailPresentation || []).filter((rail) => rail.Id !== id);
      renderConfigRailLists(page);
    });
  });
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
  page.__seerrDiscoverRailPresentation = normalizeConfigRailPresentation(
    page.__seerrDiscoverRailPresentation,
    configDiscoverRows(page).map((rail) => rail.Id)
  );
  renderConfigRailLists(page);
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
