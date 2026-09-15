import type { EditionListItem, NewspaperEdition } from "@/lib/edition-types";
import { preserveNewsUrls } from "@/lib/news-links";

const DB_NAME = "daily-tailor-editions";
const DB_VERSION = 1;
const STORE = "editions";
/** Network fetch must not leave Safari on “Caricamento…” forever. */
const FETCH_TIMEOUT_MS = 8_000;
/** IndexedDB open/read/write — Safari can hang; never block the UI on it. */
const IDB_TIMEOUT_MS = 2_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "dateKey" });
      }
    };
  });
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function withDbTimeout<T>(
  run: (db: IDBDatabase) => Promise<T>,
): Promise<T> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB unavailable");
  }
  return withTimeout(
    (async () => {
      const db = await openDb();
      try {
        return await run(db);
      } finally {
        db.close();
      }
    })(),
    IDB_TIMEOUT_MS,
    "IndexedDB",
  );
}

function withPreservedNews(edition: NewspaperEdition): NewspaperEdition {
  return { ...edition, news: preserveNewsUrls(edition.news) };
}

export async function cacheEditionLocally(
  edition: NewspaperEdition,
): Promise<void> {
  try {
    await withDbTimeout(async (db) => {
      const tx = db.transaction(STORE, "readwrite");
      await idbReq(tx.objectStore(STORE).put(withPreservedNews(edition)));
    });
  } catch {
    // Best-effort cache only — never fail the reader path.
  }
}

export async function readLocalEdition(
  dateKey: string,
): Promise<NewspaperEdition | null> {
  try {
    return await withDbTimeout(async (db) => {
      const tx = db.transaction(STORE, "readonly");
      const value = await idbReq(
        tx.objectStore(STORE).get(dateKey) as IDBRequest<
          NewspaperEdition | undefined
        >,
      );
      return value ? withPreservedNews(value) : null;
    });
  } catch {
    return null;
  }
}

export async function listLocalEditions(): Promise<EditionListItem[]> {
  try {
    return await withDbTimeout(async (db) => {
      const tx = db.transaction(STORE, "readonly");
      const all = await idbReq(
        tx.objectStore(STORE).getAll() as IDBRequest<NewspaperEdition[]>,
      );
      return (all ?? [])
        .map((e) => ({
          dateKey: e.dateKey,
          generatedAt: e.generatedAt,
          productName: e.productName,
        }))
        .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
    });
  } catch {
    return [];
  }
}

export type EditionLoadSource = "network" | "local" | "none";

async function fetchEditionJson(
  path: string,
): Promise<{ edition: NewspaperEdition } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { edition?: NewspaperEdition };
    if (body.edition?.schemaVersion === 1) {
      return { edition: withPreservedNews(body.edition) };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prefer network; on failure or offline, use IndexedDB.
 * When online succeeds, refresh the local cache in the background
 * (never await IDB before returning the edition).
 */
export async function loadEditionForClient(
  dateKey: "today" | string,
): Promise<{
  edition: NewspaperEdition | null;
  source: EditionLoadSource;
  error?: string;
}> {
  const path =
    dateKey === "today"
      ? "/api/edition/today"
      : `/api/edition/${encodeURIComponent(dateKey)}`;

  let networkError: string | undefined;

  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    try {
      const body = await fetchEditionJson(path);
      if (body?.edition) {
        void cacheEditionLocally(body.edition);
        return { edition: body.edition, source: "network" };
      }
    } catch (err) {
      networkError =
        err instanceof Error && err.name === "AbortError"
          ? "Timeout rete"
          : "Rete non disponibile";
    }
  }

  const key =
    dateKey === "today"
      ? (await peekTodayKeyFromLocal()) ?? null
      : dateKey;

  if (key) {
    const local = await readLocalEdition(key);
    if (local) return { edition: local, source: "local" };
  }

  // Today offline without knowing key: take newest local edition.
  if (dateKey === "today") {
    const listed = await listLocalEditions();
    if (listed[0]) {
      const local = await readLocalEdition(listed[0].dateKey);
      if (local) return { edition: local, source: "local" };
    }
  }

  return {
    edition: null,
    source: "none",
    error: networkError ?? "Nessuna edizione in cache locale",
  };
}

async function peekTodayKeyFromLocal(): Promise<string | null> {
  // Best-effort: try civil "today" keys around Rome midnight without importing
  // server edition helpers (keeps this module browser-safe).
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const civil = fmt.format(new Date());
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour < 6) {
    const [y, m, d] = civil.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d - 1));
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
  }
  return civil;
}
