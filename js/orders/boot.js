// boot.js — service worker registration for the Home and Orders pages.
//
// index.html registers the service worker via js/app.js (which we never modify);
// the new pages need their own CSP-safe external registration so the PWA works
// when launched from index.html (the Home start_url) or orders.html.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.error('Service worker registration failed:', err));
  });
}
