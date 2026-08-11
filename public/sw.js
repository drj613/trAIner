const CACHE_PREFIX = "trainer-app-shell-";
const CACHE_NAME = CACHE_PREFIX + "v3";
// Derive the deploy base ("/trAIner/") from where this worker is registered,
// so these paths are correct on GitHub Pages and on localhost preview alike.
const BASE = new URL(self.registration.scope).pathname;
// Real files only — SPA routes return 404-status HTML on GitHub Pages and
// would fail cache.addAll (and be wrong to cache as distinct documents).
const PRECACHE = [BASE, BASE + "manifest.webmanifest", BASE + "icon-192.png", BASE + "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Only touch our own caches: Cache Storage is shared across the whole
      // github.io origin, and other projects' caches are not ours to delete.
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(BASE + "today");
    })
  );
});

function cachePut(event, request, response) {
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations: network-first so a deployed update is picked up immediately;
  // offline, fall back to the cached root document (the SPA shell serves any
  // route). Never pin users to a stale shell — stale shell code running
  // against a newer DB schema throws VersionError and can't open its own data.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Refresh the offline shell under the NORMALIZED key (BASE), not the
          // raw navigation URL: real navigations are /trAIner/today (404 status
          // on Pages — never response.ok) and 404.html's /trAIner/?p=... redirect
          // (a junk cache key per deep link). Without this, the shell cached at
          // install time is served offline forever — the stale-shell/VersionError
          // trap this strategy exists to prevent. sw.js's bytes never change
          // between deploys, so install-time precache alone cannot keep it fresh.
          if (response.ok && sameOrigin) cachePut(event, BASE, response);
          return response;
        })
        .catch(() => caches.match(BASE))
    );
    return;
  }

  // Hashed build assets: cache-first (filenames are content-hashed, so a
  // cached asset is immutable). Populated on first fetch after install.
  if (sameOrigin && url.pathname.startsWith(BASE + "assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) cachePut(event, event.request, response);
          return response;
        });
      })
    );
    return;
  }

  // Everything else (cross-origin, unversioned files): straight to network.
});
