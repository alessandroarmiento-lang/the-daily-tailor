/* The Daily Tailor — offline shell + edition JSON cache.
 * iOS Safari / Add to Home Screen: SW runs, but there is NO silent
 * background push. The phone updates cache when the app is opened.
 * Home Screen icon start_url is "/" → today's edition.
 *
 * v5: layout fix — in-flow rows must not crush (overlap) under A4 height.
 * v4: HTML navigations are network-first (cache-first served stale
 * documents whose /_next/*.css hashes 404 after deploy → precip chart
 * collapsed to “h07%0” lines). Bundles still never intercepted.
 */
const SHELL_CACHE = "daily-tailor-shell-v5";
const DATA_CACHE = "daily-tailor-data-v2";
const NETWORK_TIMEOUT_MS = 8000;

const SHELL_URLS = [
  "/",
  "/storia",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept Next.js runtime / HMR / chunk assets — stale cache
  // of broken JS left Safari on “Caricamento…”.
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/__nextjs")
  ) {
    return;
  }

  // Cache-bust query (?v=…) → network only for navigations/shell.
  if (url.searchParams.has("v")) {
    event.respondWith(networkOnly(req));
    return;
  }

  const isEditionApi =
    url.pathname === "/api/edition/today" ||
    url.pathname === "/api/editions" ||
    /^\/api\/edition\/\d{4}-\d{2}-\d{2}$/.test(url.pathname);

  if (isEditionApi) {
    event.respondWith(networkFirstData(req));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Documents: network-first so HTML always matches current CSS hashes.
  const isDocument =
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname === "/" ||
    url.pathname === "/storia";

  if (isDocument) {
    event.respondWith(networkFirstShell(req));
    return;
  }

  event.respondWith(cacheFirstShell(req));
});

function fetchWithTimeout(req, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(req, { signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function networkOnly(req) {
  try {
    return await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    return (
      cached ??
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function networkFirstData(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
    if (fresh.ok) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: "Offline e nessuna copia in cache" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function networkFirstShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
    if (fresh.ok) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const fallback = await cache.match("/");
    return (
      fallback ??
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirstShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) {
    fetch(req)
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  try {
    const fresh = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const fallback = await cache.match("/");
    return (
      fallback ??
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}
