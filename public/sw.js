// Service worker: makes Starcall installable, fast to open, and usable briefly offline.
//
//   App code (/_next/static, icons): cached forever. Next.js gives these unique file names per build.
//   Pages and stock data (/data/...):  network first, so you always get the latest prices;
//                                       the last copy is used when you're offline.
//   Anything on another site (Anthropic API, news links): never touched.

const VERSION = "v2"; // bumped for the Starcall redesign so the new icons replace the old cached ones
const scope = new URL(self.registration.scope).pathname; // "/call-journal/" (live) or "/call-journal/dev/"
// Live and dev share one web address, so cache names include the scope to keep them apart
const STATIC = `static-${VERSION}:${scope}`;
const DYNAMIC = `dynamic-${VERSION}:${scope}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(DYNAMIC).then((c) => c.addAll([scope, `${scope}calls/`, `${scope}stock/`]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Delete only this site's old caches (and pre-scope ones from the first version), never the other site's
    for (const key of await caches.keys()) {
      const mine = key.endsWith(`:${scope}`) || !key.includes(":");
      if (mine && ![STATIC, DYNAMIC].includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(scope)) return;
  // The live worker's scope also covers /dev/; leave those requests to the dev site's own worker
  if (url.pathname.startsWith(`${scope}dev/`)) return;

  const path = url.pathname.slice(scope.length - 1);
  if (path.startsWith("/_next/static/") || path.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req, url));
  }
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(STATIC);
    await cache.put(req, res.clone());
    trim(cache, 300);
  }
  return res;
}

async function networkFirst(req, url) {
  const cache = await caches.open(DYNAMIC);
  try {
    const res = await fetch(req);
        if (res.ok) { await cache.put(req, res.clone()); trim(cache, 300); }
    return res;
  } catch (err) {
    // Offline: same URL, or for pages the same path without the ?query (e.g. /stock/?s=AAPL -> /stock/)
    const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

// The site is redeployed often (new file names each build), so keep each cache to its newest
// `max` entries. Cache keys come back oldest first.
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}
