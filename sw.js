const CACHE_NAME = 'dwithease-discover-v1';

const STATIC_ASSETS = [
    './',
    'index.html',
    'manifest.webmanifest',
    'assets/discover.css',
    'assets/discover-page.js',
    'assets/feed-model.js',
    'assets/dwithease-logo.svg',
    'assets/dwithease-logo-on-dark.svg',
    'assets/discover-fallback.png',
    'assets/sources/source-fallback.svg',
    'assets/sources/intentfusion.svg',
    'assets/sources/intentfusion-dark.svg',
    'assets/sources/github.svg',
    'assets/sources/github-dark.svg',
    'sources.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Dynamic feed JSON: Network-first, fallback to cache
    if (url.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse.ok) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Static assets: Stale-while-revalidate / cache-first
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse.ok) {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return networkResponse;
            }).catch(() => null);

            return cachedResponse || fetchPromise;
        })
    );
});
