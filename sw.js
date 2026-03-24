const CACHE_NAME = "rocky-translator-v5";
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./config.json",
    "./manifest.json",
    "./apple-touch-icon.png",
    "./icon-192.png",
    "./icon-512.png"
];

const withScope = (path) => new URL(path, self.registration.scope).toString();
const configUrl = withScope("./config.json");

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

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        const response = await fetch(request);
        if (response.ok) {
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cachedResponse = await cache.match(request, { ignoreSearch: true });
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(event.request.url);

    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    if (requestUrl.toString() === configUrl) {
        event.respondWith(networkFirst(event.request));
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
