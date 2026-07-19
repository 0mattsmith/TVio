// Minimal offline-first service worker (app shell cache).
const CACHE = "tvio-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  // Never cache API calls or addon requests — always hit the network so
  // metadata is fresh and addon stream URLs (which can expire) aren't stale.
  if (
    request.url.includes("api.themoviedb.org") ||
    request.url.includes("firestore") ||
    request.url.includes("/manifest.json") ||
    request.url.includes("/stream/") ||
    /\.(m3u8?|ts|xml|xml\.gz)(\?|$)/i.test(request.url)
  )
    return;

  // Network-first for page navigations so a fresh app shell is always used
  // (a stale cached shell caused white screens needing a hard reload). Falls
  // back to cache only when offline.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Cache-first for hashed static assets (they never change under one URL).
  e.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
