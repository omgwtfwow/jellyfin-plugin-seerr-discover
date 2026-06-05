export default class SeerrDiscoverConfigPageController {
  constructor(view) {
    if (!view || view.dataset.seerrConfigControllerLoaded === 'true') return;
    view.dataset.seerrConfigControllerLoaded = 'true';

    if (window.SeerrDiscoverConfigPageLoaded) return;

    const script = view.querySelector('script[data-seerr-config-inline]');
    if (!script?.textContent) {
      console.warn('Seerr Discover config page script was not found.');
      return;
    }

    try {
      new Function(script.textContent)();
    } catch (error) {
      console.error('Seerr Discover config page failed to initialize', error);
    }
  }
}
