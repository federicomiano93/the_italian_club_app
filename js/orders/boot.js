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

// Splash overlay (index.html only): fade it out once the page is ready, then
// remove it from the DOM. A minimum visible time avoids an ugly flash on fast
// loads; a safety timeout guarantees the splash is never left covering the home.
(function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return; // pages without a splash (e.g. orders.html)

  const MIN_VISIBLE_MS = 600;  // keep it on screen at least this long
  const SAFETY_MS = 4000;      // hard cap: always remove the splash by now
  const start = performance.now();
  let removed = false;

  const remove = () => {
    if (removed) return;
    removed = true;
    splash.classList.add('splash--hide');
    // Drop it after the CSS fade so it can't intercept taps on the home.
    setTimeout(() => splash.remove(), 500);
  };

  const dismiss = () => {
    const waited = performance.now() - start;
    setTimeout(remove, Math.max(0, MIN_VISIBLE_MS - waited));
  };

  if (document.readyState === 'complete') dismiss();
  else window.addEventListener('load', dismiss);

  setTimeout(remove, SAFETY_MS); // failsafe, regardless of load events
})();
