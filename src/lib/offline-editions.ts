import type { EditionListItem, NewspaperEdition } from "@/lib/edition-types";
import { preserveNewsUrls } from "@/lib/news-links";

const DB_NAME = "daily-tailor-editions";
const DB_VERSION = 1;
const STORE = "editions";

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

function withPreservedNews(edition: NewspaperEdition): NewspaperEdition {
  return { ...edition, news: preserveNewsUrls(edition.news) };
}

export async function cacheEditionLocally(
  edition: NewspaperEdition,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbReq(tx.objectStore(STORE).put(withPreservedNews(edition)));
  } finally {
    db.close();
  }
}

export async function readLocalEdition(
  dateKey: string,
): Promise<NewspaperEdition | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const value = await idbReq(
      tx.objectStore(STORE).get(dateKey) as IDBRequest<
        NewspaperEdition | undefined
      >,
    );
    return value ? withPreservedNews(value) : null;
  } finally {
    db.close();
  }
}

export async function listLocalEditions(): Promise<EditionListItem[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  try {
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
  } finally {
    db.close();
  }
}

export type EditionLoadSource = "network" | "local" | "none";

/**
 * Prefer network; on failure or offline, use IndexedDB.
 * When online succeeds, always refresh the local cache.
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

  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { edition: NewspaperEdition };
        if (body.edition?.schemaVersion === 1) {
          const edition = withPreservedNews(body.edition);
          await cacheEditionLocally(edition);
          return { edition, source: "network" };
        }
      } else if (res.status === 404 && dateKey !== "today") {
        const localOnly = await readLocalEdition(dateKey);
        if (localOnly) return { edition: localOnly, source: "local" };
        return {
          edition: null,
          source: "none",
          error: "Edizione non trovata",
        };
      }
    } catch {
      // fall through to local
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
    error: "Nessuna edizione in cache locale",
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
