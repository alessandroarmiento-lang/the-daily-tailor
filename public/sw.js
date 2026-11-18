/* The Daily Tailor — offline shell + edition JSON cache + morning push.
 * iOS Safari / Add to Home Screen: SW runs. Visible Web Push at ~06:00
 * wakes this worker so today's edition is fetched into Cache API +
 * IndexedDB before the first tap — then the paper opens with no network.
 *
 * v41: cache /_next/static (hashed) + push→prefetch edition for true offline.
 * v40: history is in the document; do not abort /api/editions into Offline.
 * v4: HTML navigations are network-first (cache-first served stale
 * documents whose /_next/*.css hashes 404 after deploy).
 */
const SHELL_CACHE = "daily-tailor-shell-v41";
const DATA_CACHE = "daily-tailor-data-v3";
const STATIC_CACHE = "daily-tailor-static-v1";
const NETWORK_TIMEOUT_MS = 8000;
const IDB_NAME = "daily-tailor-editions";
const IDB_VERSION = 1;
const IDB_STORE = "editions";

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
            .filter(
              (k) =>
                k !== SHELL_CACHE && k !== DATA_CACHE && k !== STATIC_CACHE,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "PRECACHE" && Array.isArray(data.urls)) {
    event.waitUntil(precacheUrls(data.urls));
  }
  if (data.type === "PREFETCH_EDITION") {
    event.waitUntil(prefetchTodayEdition());
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/";
  event.waitUntil(openOrFocus(target));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets: cache-first (immutable). Required for offline boot.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStatic(req));
    return;
  }

  // Never intercept Next.js runtime / HMR / RSC flight plumbing.
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/__nextjs")
  ) {
    return;
  }

  if (url.searchParams.has("v")) {
    event.respondWith(networkOnly(req));
    return;
  }

  if (url.pathname === "/apri") {
    event.respondWith(networkOnly(req));
    return;
  }

  if (url.pathname === "/api/editions") {
    return;
  }

  const isEditionApi =
    url.pathname === "/api/edition/today" ||
    /^\/api\/edition\/\d{4}-\d{2}-\d{2}$/.test(url.pathname);

  if (isEditionApi) {
    event.respondWith(networkFirstData(req));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

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
    // today URL may have been stored under a dated path — try today key.
    const today = await cache.match("/api/edition/today");
    if (today) return today;
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

async function cacheFirstStatic(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function precacheUrls(urls) {
  const shell = await caches.open(SHELL_CACHE);
  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.all(
    urls.map(async (raw) => {
      try {
        const url = new URL(raw, self.location.origin);
        if (url.origin !== self.location.origin) return;
        const req = new Request(url.href, { credentials: "same-origin" });
        const res = await fetch(req);
        if (!res.ok) return;
        if (url.pathname.startsWith("/_next/static/")) {
          await staticCache.put(req, res.clone());
        } else {
          await shell.put(req, res.clone());
        }
      } catch {
        /* best-effort */
      }
    }),
  );
}

async function handlePush(event) {
  let payload = {
    type: "edition-ready",
    dateKey: "",
    title: "The Daily Tailor",
    body: "Edizione del mattino pronta offline",
    url: "/",
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    /* use defaults */
  }

  await prefetchTodayEdition();

  await self.registration.showNotification(payload.title || "The Daily Tailor", {
    body: payload.body || "Edizione pronta",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/" },
  });
}

async function prefetchTodayEdition() {
  try {
    const res = await fetch("/api/edition/today", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return;
    const body = await res.json();
    const edition = body?.edition;
    if (!edition || edition.schemaVersion !== 1 || !edition.dateKey) return;

    const cache = await caches.open(DATA_CACHE);
    const json = JSON.stringify(body);
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    await cache.put(
      "/api/edition/today",
      new Response(json, { status: 200, headers }),
    );
    await cache.put(
      `/api/edition/${edition.dateKey}`,
      new Response(json, { status: 200, headers }),
    );
    await putEditionIdb(edition);
  } catch {
    /* phone may be offline when push arrives — notification still shown */
  }
}

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error || new Error("IDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "dateKey" });
      }
    };
  });
}

async function putEditionIdb(edition) {
  const db = await openIdb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IDB write failed"));
      tx.objectStore(IDB_STORE).put(edition);
    });
  } finally {
    db.close();
  }
}

async function openOrFocus(path) {
  const url = new URL(path, self.location.origin).href;
  const all = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of all) {
    if ("focus" in client) {
      await client.focus();
      if ("navigate" in client) {
        try {
          await client.navigate(url);
        } catch {
          /* ignore */
        }
      }
      return;
    }
  }
  if (self.clients.openWindow) {
    await self.clients.openWindow(url);
  }
}
