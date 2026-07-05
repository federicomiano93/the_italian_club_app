// boot.js — service worker registration for the Recipe catalogue page.
//
// A self-contained copy of the SW-registration part of js/orders/boot.js (the
// catalogue folder never imports from js/orders/). The splash-overlay logic is
// omitted: the catalogue page has no splash.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.error('Service worker registration failed:', err));
  });
}
