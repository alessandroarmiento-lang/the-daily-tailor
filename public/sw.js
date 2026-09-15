/* The Daily Tailor — offline shell + edition JSON cache.
 * iOS Safari / Add to Home Screen: SW runs, but there is NO silent
 * background push. The phone updates cache when the app is opened.
 * Home Screen icon start_url is "/" → today's edition.
 */
const SHELL_CACHE = "daily-tailor-shell-v2";
const DATA_CACHE = "daily-tailor-data-v1";

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

  event.respondWith(cacheFirstShell(req));
});

async function networkFirstData(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetch(req);
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
    const fresh = await fetch(req);
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
