/*
 * Service worker: keeps the app usable offline while always preferring the
 * network when it is reachable, so a new deployment shows up on the next
 * launch instead of one launch later.
 *
 * Bump VERSION together with the ?v= query strings in index.html.
 */
const VERSION = '3';
const CACHE = 'pockettuner-v' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './css/style.css?v=' + VERSION,
  './js/pitch.js?v=' + VERSION,
  './js/tunings.js?v=' + VERSION,
  './js/app.js?v=' + VERSION,
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' bypasses the HTTP cache so the precache is never stale
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

function fromNetwork(request) {
  // 'no-cache' revalidates with the server instead of trusting the HTTP cache
  const req = request.mode === 'navigate'
    ? new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(request, { cache: 'no-cache' });
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  });
}

function fromCache(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('./index.html');
    return undefined;
  });
}

/** Network first; fall back to the cache when offline or when the network is slow. */
function networkFirst(request) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => { if (!settled) { settled = true; resolve(res || Response.error()); } };
    const timer = setTimeout(() => {
      fromCache(request).then((cached) => { if (cached) finish(cached); });
    }, NETWORK_TIMEOUT_MS);
    fromNetwork(request)
      .then((res) => { clearTimeout(timer); finish(res); })
      .catch(() => { clearTimeout(timer); fromCache(request).then(finish); });
  });
}
