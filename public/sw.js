const CACHE_NAME = 'lokswami-app-shell-v7';
const RUNTIME_CACHE_NAME = 'lokswami-runtime-v3';
const EPAPER_OFFLINE_CACHE_NAME = 'lokswami-epaper-offline-v2';
const LEGACY_EPAPER_OFFLINE_CACHE_NAMES = ['lokswami-epaper-offline-v1'];
const APP_SHELL_URLS = [
  '/main/epaper',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-48x48.png',
  '/favicon-96x96.png',
  '/favicon-192x192.png',
  '/logo-app-192.png',
  '/logo-app-512.png',
  '/apple-touch-icon.png',
];

function isRuntimeCacheable(url) {
  if (/\.(?:mp4|m3u8|m4s|ts|webm|mov)(?:$|[?#])/i.test(url.pathname)) {
    return false;
  }
  return (
    url.pathname.startsWith('/api/epapers/') ||
    url.pathname.startsWith('/api/public/epapers/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname === '/main/epaper'
  );
}

function settleAll(promises) {
  return Promise.all(
    promises.map((promise) =>
      Promise.resolve(promise).then(
        () => undefined,
        () => undefined
      )
    )
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await settleAll(
        APP_SHELL_URLS.map(async (url) => {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`Failed to precache ${url}`);
          }

          await cache.put(url, response);
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(async (keys) => {
        const durableOfflineCache = await caches.open(EPAPER_OFFLINE_CACHE_NAME);
        for (const legacyName of LEGACY_EPAPER_OFFLINE_CACHE_NAMES) {
          if (!keys.includes(legacyName)) continue;
          const legacyCache = await caches.open(legacyName);
          const legacyRequests = await legacyCache.keys();
          await settleAll(
            legacyRequests.map(async (request) => {
              const response = await legacyCache.match(request);
              if (response) await durableOfflineCache.put(request, response);
            })
          );
          await caches.delete(legacyName);
        }

        await Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE_NAME &&
                key !== RUNTIME_CACHE_NAME &&
                key !== EPAPER_OFFLINE_CACHE_NAME &&
                !LEGACY_EPAPER_OFFLINE_CACHE_NAMES.includes(key)
            )
            .map((key) => caches.delete(key))
        );
      })
      .then(async () => {
        if ('navigationPreload' in self.registration) {
          await self.registration.navigationPreload.enable().catch(() => undefined);
        }
        await self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }

          const networkResponse = await fetch(request);

          if (networkResponse.ok && url.pathname.startsWith('/main/epaper')) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/main/epaper', networkResponse.clone());
          }

          return networkResponse;
        } catch {
          if (url.pathname.startsWith('/main/epaper')) {
            const cachedEpaperShell = await caches.match('/main/epaper');
            if (cachedEpaperShell) {
              return cachedEpaperShell;
            }
          }

          return Response.error();
        }
      })()
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache Next.js build assets. Old cached HTML plus deleted hashed chunks
  // is exactly the failure mode that causes ChunkLoadError after deploys.
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/next/')) {
    return;
  }

  if (isRuntimeCacheable(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE_NAME);

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return Response.error();
        }
      })()
    );
    return;
  }

  const isStaticAsset = ['style', 'script', 'image', 'font', 'manifest'].includes(
    request.destination
  );

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }

        return networkResponse;
      });
    })
  );
});
