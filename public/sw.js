const CACHE_PREFIX = "trainer-app-shell-";
const CACHE_NAME = CACHE_PREFIX + "v3";
// Derive the deploy base ("/trAIner/") from where this worker is registered,
// so these paths are correct on GitHub Pages and on localhost preview alike.
// Normalize to a trailing slash: every path below is built by concatenating
// onto BASE, so a slashless scope would otherwise yield "/trAInerassets/".
const scopePath = new URL(self.registration.scope).pathname;
const BASE = scopePath.endsWith("/") ? scopePath : scopePath + "/";
// Real files only — SPA routes return 404-status HTML on GitHub Pages and
// would fail cache.addAll (and be wrong to cache as distinct documents).
const PRECACHE = [BASE, BASE + "manifest.webmanifest", BASE + "icon-192.png", BASE + "icon-512.png"];

// Cap the runtime asset cache. Hashed filenames mean entries are immutable and
// never invalidated, and CACHE_NAME is stable across deploys, so without a cap
// every deploy's superseded bundles would accumulate forever — competing for
// the same origin quota as the IndexedDB holding the user's training history.
// dist/assets held 2 files at the time this was written (one JS bundle, one
// CSS bundle); 20 comfortably covers ~10 back-to-back deploys' worth without
// risking eviction of assets a currently-open tab still depends on.
const MAX_ASSET_ENTRIES = 20;

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

// Deletes the oldest asset entries once the runtime asset cache exceeds
// MAX_ASSET_ENTRIES. Only ever touches entries under BASE + "assets/" — the
// precached shell/manifest/icons are never candidates for eviction here.
// A trim failure must not break the response it's attached to, so callers
// hang this off event.waitUntil rather than the fetch response chain.
async function trimAssetCache() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  // cache.keys() is insertion-ordered, so the front is the oldest written.
  const assetKeys = keys.filter((req) => new URL(req.url).pathname.startsWith(BASE + "assets/"));
  const excess = assetKeys.length - MAX_ASSET_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(assetKeys[i]);
}

function cachePutAsset(event, request, response) {
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(request, copy))
      .then(() => trimAssetCache())
  );
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations: network-first so an online user always gets the current
  // shell; offline, fall back to the cached root document (the SPA shell
  // serves any route) — that cached copy exists only as a last resort, never
  // as the thing users are pinned to. Stale shell code running against a
  // newer DB schema throws VersionError and can't open its own data, which is
  // exactly what always preferring the network here avoids.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Refresh the offline shell only from a root-document navigation
          // (url.pathname === BASE) — never from any other same-origin
          // navigation. Without this check, a direct navigation to a real
          // scoped file (404.html, manifest.webmanifest, an icon) would get
          // stored under the BASE key and served as the app shell offline.
          // The 404.html "?p=..." redirect still lands here as a navigation
          // to BASE (the query string isn't part of pathname), so deep links
          // still refresh the shell correctly.
          // A deploy that only changes assets may not touch sw.js's bytes at
          // all, so install-time precaching alone can't be relied on to keep
          // this cached shell current — hence refreshing it here, on every
          // successful navigation.
          if (response.ok && sameOrigin && url.pathname === BASE) cachePut(event, BASE, response);
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
          if (response.ok) cachePutAsset(event, event.request, response);
          return response;
        });
      })
    );
    return;
  }

  // Everything else (cross-origin, unversioned files): straight to network.
});
