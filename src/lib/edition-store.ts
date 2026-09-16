import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isValidDateKey } from "@/lib/edition";
import type { EditionListItem, NewspaperEdition } from "@/lib/edition-types";
import { sanitizeEditionReminders } from "@/lib/sanitize-edition-reminders";

function editionsRoot(): string {
  const override = process.env.EDITIONS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data", "editions");
}

function editionPath(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    throw new Error(`Invalid edition dateKey: ${dateKey}`);
  }
  return path.join(editionsRoot(), `${dateKey}.json`);
}

export async function ensureEditionsDir(): Promise<string> {
  const root = editionsRoot();
  await mkdir(root, { recursive: true });
  return root;
}

export async function saveEdition(
  edition: NewspaperEdition,
): Promise<string> {
  const { edition: cleaned } = sanitizeEditionReminders(edition);
  const root = await ensureEditionsDir();
  const file = path.join(root, `${cleaned.dateKey}.json`);
  await writeFile(file, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");
  return file;
}

export async function loadEdition(
  dateKey: string,
): Promise<NewspaperEdition | null> {
  try {
    const raw = await readFile(editionPath(dateKey), "utf8");
    const parsed = JSON.parse(raw) as NewspaperEdition;
    if (parsed?.schemaVersion !== 1 || parsed.dateKey !== dateKey) {
      return null;
    }
    const { edition, changed } = sanitizeEditionReminders(parsed);
    if (changed) {
      try {
        await writeFile(
          editionPath(dateKey),
          `${JSON.stringify(edition, null, 2)}\n`,
          "utf8",
        );
      } catch {
        // Still return sanitized edition even if rewrite fails.
      }
    }
    return edition;
  } catch {
    return null;
  }
}

export async function listEditions(): Promise<EditionListItem[]> {
  try {
    const root = await ensureEditionsDir();
    // Volume path is runtime (EDITIONS_DIR); ignore for standalone tracing.
    const names = await readdir(/*turbopackIgnore: true*/ root);
    const items: EditionListItem[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const dateKey = name.slice(0, -".json".length);
      if (!isValidDateKey(dateKey)) continue;
      const edition = await loadEdition(dateKey);
      if (!edition) continue;
      items.push({
        dateKey: edition.dateKey,
        generatedAt: edition.generatedAt,
        productName: edition.productName,
      });
    }
    items.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
    return items;
  } catch {
    return [];
  }
}
