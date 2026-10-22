/*
 * Offline-first app shell, so the home-screen app opens instantly instead of
 * waiting for the server (a cold server can take seconds to answer).
 *   - Page: served from cache at once, refreshed in the background; when a
 *     new version was deployed the page reloads during its opening animation.
 *   - Hashed build files, icons, flags, fonts: cache first (they never change).
 *   - API, live audio, videos and anything else: always the network.
 * No conversation data is ever cached here; only the app's own files.
 */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  (url.origin === self.location.origin &&
    /^\/(assets|flags|worklets|splash)\/|^\/(icon-|apple-touch-icon|favicon|logo|manifest)/.test(url.pathname)) ||
  url.hostname === 'fonts.googleapis.com' ||
  url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match('/');
        const before = cached ? await cached.clone().text() : null;
        const fresh = fetch(req)
          .then(async (res) => {
            if (!res.ok) return res;
            const after = await res.clone().text();
            await cache.put('/', res.clone());
            // A new version was deployed: the page reloads while its opening animation still runs
            if (before !== null && before !== after) {
              const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
              for (const c of clients) c.postMessage('app-updated');
            }
            return res;
          })
          .catch(() => cached);
        if (cached) {
          event.waitUntil(fresh);
          return cached;
        }
        return fresh;
      }),
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }),
    );
  }
});
