// sw-update.js — the ONE place the service worker is registered and updates are
// surfaced, shared by every page (index, calculator, orders, catalogue).
//
// Why this exists: update handling used to live only in the Calculator's app.js,
// so a phone that opened Home/Catalogue/Orders never learned a new version was
// out — and sw.js self-activated on install (skipWaiting), which meant the
// "waiting worker" state the banner relied on almost never happened. The result
// was phones stuck on stale versions with no way to know (the recurring
// "I see the app, they don't see my changes" bug).
//
// The flow now follows the standard PWA update-prompt pattern:
//   1. A new sw.js installs in the background and WAITS (no self-activation).
//   2. This module detects the waiting worker and shows a banner.
//   3. The user taps → we message the worker to take over → one reload → fresh.
// The page is never reloaded under the user's fingers without a tap (P20:
// never lose in-progress work).
//
// Update checks run when the page loads, whenever the app returns to the
// foreground (the case that matters for an installed PWA on a phone), and on a
// slow interval as a fallback for a tablet left open all day.

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(watchForUpdates).catch(err =>
      console.error('Service worker registration failed:', err));
  });
}

function watchForUpdates(reg) {
  if (!reg) return;

  // A banner only makes sense when THIS page is already controlled by an older
  // worker; on the very first visit the new worker is the only one and activates
  // on its own — nothing to announce.
  const isUpdate = () => !!navigator.serviceWorker.controller;

  if (reg.waiting && isUpdate()) showBanner(reg);

  reg.addEventListener('updatefound', () => {
    const incoming = reg.installing;
    if (!incoming) return;
    incoming.addEventListener('statechange', () => {
      if (incoming.state === 'installed' && isUpdate()) showBanner(reg);
    });
  });

  const check = () => reg.update().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, CHECK_INTERVAL_MS);
}

// The banner is built here (not in each page's HTML) so no page can ship
// without it; its styles live in tokens.css because the CSP (style-src 'self')
// forbids styles injected from JS.
function showBanner(reg) {
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('button');
  banner.id = 'sw-update-banner';
  banner.type = 'button';
  banner.textContent = 'New version available — tap to update';

  const host = document.createElement('div');
  host.id = 'sw-update-host';
  host.setAttribute('role', 'status');
  host.appendChild(banner);
  document.body.appendChild(host);

  banner.addEventListener('click', () => {
    banner.disabled = true;
    banner.textContent = 'Updating…';

    // Reload ONLY once the new worker has taken control, and only because the
    // user asked — an unguarded controllerchange reload can fire on first
    // install (clients.claim) and would yank the page out from under the user.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });

    if (reg.waiting) {
      reg.waiting.postMessage({ action: 'skipWaiting' });
      // Safety net: if the takeover stalls (e.g. the waiting worker was already
      // gone), a plain reload still picks up the new version.
      setTimeout(() => window.location.reload(), 4000);
    } else {
      window.location.reload();
    }
  });
}
