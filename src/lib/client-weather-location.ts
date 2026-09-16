import type { WeatherLocation } from "@/lib/weather/location-types";

const DB_NAME = "daily-tailor-geo";
const DB_VERSION = 1;
const STORE = "location";
const KEY = "last";
const IDB_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`IndexedDB timed out after ${ms}ms`)),
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
        db.createObjectStore(STORE);
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

export async function saveLocalWeatherLocation(
  location: WeatherLocation,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withTimeout(
      (async () => {
        const db = await openDb();
        try {
          const tx = db.transaction(STORE, "readwrite");
          await idbReq(tx.objectStore(STORE).put(location, KEY));
        } finally {
          db.close();
        }
      })(),
      IDB_TIMEOUT_MS,
    );
  } catch {
    // Best-effort only.
  }
}

export async function readLocalWeatherLocation(): Promise<WeatherLocation | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    return await withTimeout(
      (async () => {
        const db = await openDb();
        try {
          const tx = db.transaction(STORE, "readonly");
          const value = await idbReq(
            tx.objectStore(STORE).get(KEY) as IDBRequest<
              WeatherLocation | undefined
            >,
          );
          if (
            !value ||
            !Number.isFinite(value.latitude) ||
            !Number.isFinite(value.longitude)
          ) {
            return null;
          }
          return value;
        } finally {
          db.close();
        }
      })(),
      IDB_TIMEOUT_MS,
    );
  } catch {
    return null;
  }
}

export type GeoPermissionOutcome =
  | { ok: true; latitude: number; longitude: number; accuracy: number | null }
  | {
      ok: false;
      reason: "unsupported" | "denied" | "unavailable" | "timeout";
      message: string;
    };

/** Browser geolocation with a short timeout suited to PWA open. */
export function requestBrowserGeolocation(
  timeoutMs = 12_000,
): Promise<GeoPermissionOutcome> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({
      ok: false,
      reason: "unsupported",
      message: "Geolocalizzazione non supportata da questo browser.",
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : null,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({
            ok: false,
            reason: "denied",
            message:
              "Posizione negata. Uso l’ultima nota o Milano come predefinita.",
          });
          return;
        }
        if (err.code === err.TIMEOUT) {
          resolve({
            ok: false,
            reason: "timeout",
            message: "Timeout posizione. Uso l’ultima nota o Milano.",
          });
          return;
        }
        resolve({
          ok: false,
          reason: "unavailable",
          message: "Posizione non disponibile. Uso l’ultima nota o Milano.",
        });
      },
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: 5 * 60_000,
      },
    );
  });
}
