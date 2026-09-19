/*
 * Sanjeevani service worker.
 *
 * Two goals, in priority order:
 *   1. The emergency page and its verified numbers work with no network, ever.
 *   2. The app shell and its code are cached, so triage can run in the browser when
 *      the server is unreachable. The safety rules need no network — the only reason
 *      they would be unavailable offline is that their JavaScript was not cached.
 *
 * API responses are never cached. Stale clinical guidance is worse than none, and a
 * cached hospital list could send someone to a place that has since closed.
 */
const CACHE = 'sanjeevani-v2';

/** Fetched at install: the two pages that must survive with no network at all. */
const PRECACHE = ['/emergency', '/icon.svg', '/manifest.webmanifest'];

/** Pages cached as the user visits them, so a reload offline still works. */
const SHELL_PATHS = new Set(['/', '/emergency', '/guide', '/about', '/settings', '/settings/emergency-contact']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One bad URL must not fail the whole install and leave nothing cached.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never cache the API. Health guidance must always be current, and a cached
  // hospital list could point someone at a place that has closed.
  if (url.pathname.startsWith('/api/')) return;

  /*
   * Build assets are content-hashed, so a cache hit is always correct. This is what
   * makes in-browser triage possible offline: the engine's chunk is fetched once by
   * the warm-up while online, and served from here afterwards.
   */
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  /*
   * Pages are network-first: a working connection should always win, because the
   * server may have newer guidance. The cache is the fallback, and the emergency page
   * is the fallback's fallback — whatever else fails, 112 is reachable.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && SHELL_PATHS.has(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(url.pathname)
            .then((hit) => hit || caches.match('/'))
            .then((hit) => hit || caches.match('/emergency'))
            .then(
              (hit) =>
                hit ||
                new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><p>Offline. Call 112 for emergencies.', {
                  status: 503,
                  headers: { 'content-type': 'text/html; charset=utf-8' },
                }),
            ),
        ),
    );
  }
});
