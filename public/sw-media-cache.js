/* Service worker: cache local media for chat */
const CACHE = 'collab-media-v1';

function isMediaUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.startsWith('/media/');
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!isMediaUrl(event.request.url)) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok && res.type === 'basic') {
            try {
              cache.put(event.request, res.clone());
            } catch (_) {}
          }
          return res;
        });
      })
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith('collab-media-') && k !== CACHE).map((k) => caches.delete(k))
      )
    )
  );
});
