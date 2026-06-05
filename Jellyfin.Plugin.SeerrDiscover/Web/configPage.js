export default class SeerrDiscoverConfigPageController {
  constructor(view) {
    if (typeof window.SeerrDiscoverInitializeConfigPage === 'function') {
      window.SeerrDiscoverInitializeConfigPage(view);
    }
  }
}
