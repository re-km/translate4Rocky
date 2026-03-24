const CACHE_NAME = "rocky-translator-v1";
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.json",
    "./apple-touch-icon.png",
    "./icon-192.png",
    "./icon-512.png"
];

const withScope = (path) => new URL(path, self.registration.scope).toString();

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL.map(withScope));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter((cacheName) => cacheName !== CACHE_NAME)
                .map((cacheName) => caches.delete(cacheName))
        );
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(event.request.url);

    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    event.respondWith((async () => {
        const cachedResponse = await caches.match(event.request, { ignoreSearch: true });

        if (cachedResponse) {
            return cachedResponse;
        }

        try {
            return await fetch(event.request);
        } catch (error) {
            if (event.request.mode === "navigate") {
                const offlinePage = await caches.match(withScope("./index.html"));
                if (offlinePage) {
                    return offlinePage;
                }
            }

            throw error;
        }
    })());
});
