/* voiceverb — static service worker, no dependencies. */
const CACHE = "voiceverb-v6";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./audio.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./CALL-SETUP.md",
];
const OFFLINE_FALLBACK = "./index.html";
const CACHE_PREFIX = "voiceverb-";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // allSettled: a missing asset does not prevent installing the rest.
      await Promise.allSettled(
        PRECACHE.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response && (response.ok || response.type === "opaque")) {
              await cache.put(url, response);
            }
          } catch (_) {
            // No network or file not published yet: ignore.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isCacheable(response) {
  return Boolean(response) && (response.ok || response.type === "opaque");
}

async function cachePut(request, response) {
  if (!isCacheable(response)) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch (_) {
    // Quota full or response already consumed: not fatal.
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cachePut(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match(OFFLINE_FALLBACK);
    if (fallback) return fallback;
    const root = await caches.match("./");
    if (root) return root;
    return new Response(
      "<!doctype html><meta charset=\"utf-8\"><title>voiceverb</title>" +
        "<body style=\"background:#0b0e14;color:#e8edf7;font:16px system-ui;padding:2rem\">" +
        "<h1>voiceverb</h1><p>Você está offline e o app ainda não foi cacheado. " +
        "Conecte-se e recarregue.</p></body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    await cachePut(request, response.clone());
    return response;
  } catch (_) {
    return new Response("Recurso indisponível offline.", {
      status: 504,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Ignores non-GET methods, cross-origin requests and non-HTTP schemes.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // The service worker itself must never come from the cache (updates).
  if (url.pathname.endsWith("/sw.js")) return;

  // Navigation: network first, cache as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Assets: cache first, network afterwards.
  event.respondWith(cacheFirst(request));
});
