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

const DENIED_SESSION_KEY = "tdt-geo-denied";
const GRANTED_KEY = "tdt-geo-granted";

function readDeniedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DENIED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markDeniedThisSession(): void {
  try {
    sessionStorage.setItem(DENIED_SESSION_KEY, "1");
  } catch {
    // Best-effort only.
  }
}

function readGrantedFlag(): boolean {
  try {
    return localStorage.getItem(GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}

function markGranted(): void {
  try {
    localStorage.setItem(GRANTED_KEY, "1");
  } catch {
    // Best-effort only.
  }
}

/**
 * If the OS already said no, skip getCurrentPosition so Safari/PWA does not
 * keep resurfacing the Consenti sheet on every open.
 */
async function permissionAlreadyDenied(): Promise<boolean> {
  if (readDeniedThisSession()) return true;
  try {
    const permissions = navigator.permissions;
    if (!permissions?.query) return false;
    const status = await permissions.query({
      name: "geolocation" as PermissionName,
    });
    if (status.state === "denied") {
      markDeniedThisSession();
      return true;
    }
  } catch {
    // iOS Safari may reject the query; fall through to getCurrentPosition.
  }
  return false;
}

async function permissionAlreadyGranted(): Promise<boolean> {
  if (readGrantedFlag()) return true;
  try {
    const permissions = navigator.permissions;
    if (!permissions?.query) return false;
    const status = await permissions.query({
      name: "geolocation" as PermissionName,
    });
    if (status.state === "granted") {
      markGranted();
      return true;
    }
  } catch {
    // iOS Safari may reject the query.
  }
  return false;
}

/**
 * Ask the OS for GPS at most once per browser profile.
 * After a successful Consenti we persist coords + a grant flag; later opens
 * reuse IndexedDB and never call getCurrentPosition again (Safari/iOS would
 * otherwise re-show the sheet even when the user already allowed).
 */
export async function resolveBrowserGeolocation(
  timeoutMs = 12_000,
): Promise<
  | (GeoPermissionOutcome & { fromCache?: boolean })
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracy: number | null;
      fromCache: true;
    }
> {
  const local = await readLocalWeatherLocation();
  if (local) {
    markGranted();
    return {
      ok: true,
      latitude: local.latitude,
      longitude: local.longitude,
      accuracy: null,
      fromCache: true,
    };
  }

  // Grant flag without coords (IDB cleared): do not re-prompt — caller falls back.
  if (readGrantedFlag() || (await permissionAlreadyGranted())) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Posizione già consentita; uso l’ultima nota sul server.",
    };
  }

  // First visit only — may show Consenti once.
  return requestBrowserGeolocation(timeoutMs);
}

/** Browser geolocation with a short timeout suited to PWA open. */
export async function requestBrowserGeolocation(
  timeoutMs = 12_000,
): Promise<GeoPermissionOutcome> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Geolocalizzazione non supportata da questo browser.",
    };
  }

  if (await permissionAlreadyDenied()) {
    return {
      ok: false,
      reason: "denied",
      message:
        "Posizione negata. Uso l’ultima nota o Milano come predefinita.",
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        markGranted();
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
          markDeniedThisSession();
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
        maximumAge: grantedMaximumAgeMs(),
      },
    );
  });
}

function grantedMaximumAgeMs(): number {
  // After a prior grant, accept a stale fix so Safari does not re-prompt.
  return readGrantedFlag() ? 24 * 60 * 60_000 : 5 * 60_000;
}
