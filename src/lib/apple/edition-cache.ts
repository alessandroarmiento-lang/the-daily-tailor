import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEditionDateKey } from "@/lib/edition";

/**
 * Adapter section cache root.
 * On Fly the image `/app` is read-only for user `nextjs`; prefer the editions
 * volume (EDITIONS_DIR) or an explicit EDITION_ADAPTER_CACHE_DIR.
 */
export function getEditionAdapterCacheRoot(): string {
  const explicit = process.env.EDITION_ADAPTER_CACHE_DIR?.trim();
  if (explicit) return explicit;

  const editionsDir = process.env.EDITIONS_DIR?.trim();
  if (editionsDir) {
    return path.join(editionsDir, ".adapter-cache");
  }

  return path.join(process.cwd(), ".cache", "edition-adapters");
}

function cacheRoot(): string {
  return getEditionAdapterCacheRoot();
}

export async function readEditionCache<T>(
  section: string,
  editionDateKey = getEditionDateKey(),
): Promise<T | null> {
  const file = path.join(cacheRoot(), editionDateKey, `${section}.json`);
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeEditionCache<T>(
  section: string,
  data: T,
  editionDateKey = getEditionDateKey(),
): Promise<void> {
  const dir = path.join(/* turbopackIgnore: true */ cacheRoot(), editionDateKey);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${section}.json`);
  await writeFile(
    file,
    JSON.stringify(
      { editionDateKey, savedAt: new Date().toISOString(), data },
      null,
      2,
    ),
    "utf8",
  );
}

export type CachedEnvelope<T> = {
  editionDateKey: string;
  savedAt: string;
  data: T;
};

export async function readEditionCacheEnvelope<T>(
  section: string,
  editionDateKey = getEditionDateKey(),
): Promise<CachedEnvelope<T> | null> {
  const file = path.join(cacheRoot(), editionDateKey, `${section}.json`);
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as CachedEnvelope<T>;
    // Empty arrays are not a useful hit — adapters must re-fetch (e.g. CalDAV
    // wrote [] while EventKit still has open reminders / events).
    if (Array.isArray(parsed.data) && parsed.data.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Drop per-section adapter cache for an edition (used by morning-warm ?force=1). */
export async function clearEditionAdapterCache(
  editionDateKey = getEditionDateKey(),
): Promise<void> {
  const dir = path.join(/* turbopackIgnore: true */ cacheRoot(), editionDateKey);
  await rm(dir, { recursive: true, force: true });
}
