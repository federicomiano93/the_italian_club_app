const CACHE_NAME = 'theitalianclub-v132';
const ASSETS = [
  './',
  './index.html',
  './home.html',
  './calculator.html',
  './orders.html',
  './install-guide.html',
  './qr.png',
  './js/install-guide.js',
  './style.css',
  './orders.css',
  './js/app.js',
  './js/idle-reset.js',
  './js/install.js',
  './js/firebase.js',
  './js/recipes.js',
  './js/calc.js',
  './js/calculator-recipe-text.js',
  './js/calculator-dough-math.js',
  './js/log.js',
  './js/log-time.js',
  './js/log-model.js',
  './js/log-store.js',
  './js/log-view.js',
  './js/log-edit.js',
  './js/whatsapp.js',
  './js/calculator-confirm.js',
  './js/calculator-config.js',
  './js/calculator-config-store.js',
  './js/calculator-render.js',
  './js/calculator-settings.js',
  './js/calculator-whatsapp-settings.js',
  './js/vendor/sortable.esm.js',
  './js/orders/boot.js',
  './js/orders/firebase-orders.js',
  './js/orders/orders-main.js',
  './js/orders/dom.js',
  './js/orders/week.js',
  './js/orders/suppliers.js',
  './js/orders/ingredients.js',
  './js/orders/draft.js',
  './js/orders/preview.js',
  './js/orders/history.js',
  './js/orders/management.js',
  './js/orders/bank-holidays.js',
  './js/orders/suggestions.js',
  './js/orders/notifications.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  // Cache assets one-by-one — if one fails, installation still succeeds
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Never touch cross-origin requests (Firebase SDK CDN, Firestore/Auth API and,
  // on localhost, the Firebase emulator). Returning WITHOUT respondWith lets the
  // browser perform them directly: re-issuing a cross-origin request through the
  // service worker (the old e.respondWith(fetch(...)) ) could fail transiently on
  // the very first call — e.g. a spurious auth/network-request-failed on anonymous
  // sign-in. Bypassing the SW entirely is the correct pattern and also removes a
  // pointless round-trip for the live Firebase calls.
  if (new URL(e.request.url).origin !== self.location.origin) {
    return;
  }

  // Install guide assets: always network-first (fresh from server), falling back
  // to cache only when offline. Avoids serving a stale guide after an update.
  const p = new URL(e.request.url).pathname;
  if (p.endsWith('/install-guide.html') || p.endsWith('/qr.png') || p.endsWith('/js/install-guide.js')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first with background update: serve cached version immediately,
  // fetch from network in background to keep cache fresh.
  // This prevents white screens on poor connections.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

self.addEventListener('message', e => {
  if (!e.source) return;
  if (e.data && e.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
