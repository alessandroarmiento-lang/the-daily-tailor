import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEditionDateKey } from "@/lib/edition";

const CACHE_ROOT = path.join(process.cwd(), ".cache", "edition-adapters");

export async function readEditionCache<T>(
  section: string,
  editionDateKey = getEditionDateKey(),
): Promise<T | null> {
  const file = path.join(CACHE_ROOT, editionDateKey, `${section}.json`);
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
  const dir = path.join(CACHE_ROOT, editionDateKey);
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
  const file = path.join(CACHE_ROOT, editionDateKey, `${section}.json`);
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as CachedEnvelope<T>;
  } catch {
    return null;
  }
}

/** Drop per-section adapter cache for an edition (used by morning-warm ?force=1). */
export async function clearEditionAdapterCache(
  editionDateKey = getEditionDateKey(),
): Promise<void> {
  const dir = path.join(CACHE_ROOT, editionDateKey);
  await rm(dir, { recursive: true, force: true });
}
