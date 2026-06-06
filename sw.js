const CACHE_NAME = 'bakery-v62';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/app.js',
  './js/firebase.js',
  './js/recipes.js',
  './js/calc.js',
  './js/log.js',
  './js/whatsapp.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
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
  // Never cache cross-origin requests (Firebase SDK CDN, Firestore API, etc.)
  if (new URL(e.request.url).origin !== self.location.origin) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Network first for same-origin assets — always try to get fresh content
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Listen for skipWaiting message from client — e.source must exist (same-origin client only)
self.addEventListener('message', e => {
  if (!e.source) return;
  if (e.data && e.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
