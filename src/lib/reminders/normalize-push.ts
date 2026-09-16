/**
 * Pure push-payload normalization (no Node APIs).
 * iPhone Shortcuts often stringifies each Dictionary, so entries arrive as
 * JSON text — never treat that blob as the reminder title.
 */
import type { ReminderItem, ReminderPriority } from "./types";

export const MAX_ITEMS = 200;
export const MAX_TITLE_CHARS = 300;
export const MAX_NOTES_CHARS = 500;
export const MAX_LIST_CHARS = 80;

export type NormalizedPush = {
  /** False when the body is not a reminders list at all (bad request). */
  valid: boolean;
  items: ReminderItem[];
  /** Entries in the payload, before filtering. */
  received: number;
  /** Dropped: completed, untitled, or duplicated. */
  skipped: number;
};

export function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Case-insensitive field reader — Shortcuts writes keys like `Titolo`. */
export function reader(raw: Record<string, unknown>): (keys: string[]) => unknown {
  const byLower = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    byLower.set(key.toLowerCase(), value);
  }
  return (keys) => {
    for (const key of keys) {
      const value = byLower.get(key);
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
  };
}

/**
 * ISO 8601 preferred (Shortcuts: Formatta data → `yyyy-MM-dd'T'HH:mm:ssZ`).
 * Also tolerates epoch seconds/ms and the Italian `gg/mm/aaaa, hh:mm` text.
 */
export function parseDueAt(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = String(value).trim();
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const italian =
    /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/.exec(text);
  if (italian) {
    const [, d, m, y, hh, mm] = italian;
    const composed = new Date(
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${(hh ?? "09").padStart(
        2,
        "0",
      )}:${mm ?? "00"}:00`,
    );
    if (!Number.isNaN(composed.getTime())) return composed.toISOString();
  }

  return null;
}

function parsePriority(value: unknown): ReminderPriority {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return "none";
    if (value <= 3) return "high";
    if (value <= 6) return "medium";
    return "low";
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "none";
  if (/^\d+$/.test(text)) return parsePriority(Number(text));
  if (text.startsWith("alt") || text.startsWith("high")) return "high";
  if (text.startsWith("med")) return "medium";
  if (text.startsWith("bas") || text.startsWith("low")) return "low";
  return "none";
}

function parseCompleted(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "si", "sì", "completato", "completed"].includes(
    text,
  );
}

/** Parse a single stringified Dictionary / object, or null. */
export function tryParseJsonObject(
  value: string,
): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON.
  }
  return null;
}

/**
 * Shortcuts flattens a reminders variable before sending it: either a JSON
 * array as text, or one title per line. Both become a list here.
 */
function coerceNestedString(value: string): unknown[] | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return [parsed];
    } catch {
      // Not JSON: fall through to the line-per-title reading.
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : null;
}

function coerceList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  for (const key of ["reminders", "items", "promemoria", "data"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      const nested = coerceNestedString(value);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Turn one list entry into a field record.
 * Stringified Dictionaries from Shortcuts are parsed — not used as titles.
 */
export function coerceReminderEntry(
  entry: unknown,
): Record<string, unknown> | null {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return peelStringifiedTitleFields(entry as Record<string, unknown>);
  }
  if (typeof entry === "string" && entry.trim()) {
    const asObj = tryParseJsonObject(entry);
    if (asObj) return peelStringifiedTitleFields(asObj);
    return { title: entry };
  }
  return null;
}

/**
 * If `title` (or Italian aliases) is itself a stringified dict, merge those
 * fields in so listName / dueAt / notes / id are not lost.
 */
export function peelStringifiedTitleFields(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const get = reader(record);
  const titleRaw = get(["title", "titolo", "name", "nome", "summary"]);
  if (typeof titleRaw !== "string") return record;
  const nested = tryParseJsonObject(titleRaw);
  if (!nested) return record;
  // Nested fields win for identity; keep any outer extras.
  return { ...record, ...nested };
}

function reminderFromRecord(record: Record<string, unknown>): ReminderItem | null {
  const peeled = peelStringifiedTitleFields(record);
  const get = reader(peeled);

  if (parseCompleted(get(["iscompleted", "completed", "completato"]))) {
    return null;
  }

  const title = clampText(
    get(["title", "titolo", "name", "nome", "summary"]),
    MAX_TITLE_CHARS,
  );
  // After peel, title must be plain text — never a leftover JSON blob.
  if (!title || tryParseJsonObject(title)) return null;

  const listName =
    clampText(
      get(["listname", "list", "lista", "elenco", "calendar"]),
      MAX_LIST_CHARS,
    ) || "Promemoria";

  const rawId = clampText(get(["id", "identifier", "uuid"]), 200);

  return {
    id: rawId || `push-${listName}|${title}`.toLowerCase(),
    title,
    notes:
      clampText(get(["notes", "note", "body", "description"]), MAX_NOTES_CHARS) ||
      null,
    listName,
    dueAt: parseDueAt(get(["dueat", "due", "duedate", "scadenza", "data"])),
    isCompleted: false,
    priority: parsePriority(get(["priority", "priorita", "priorità"])),
  };
}

/**
 * Accept a bare array, `{ reminders: [...] }`, or a JSON string of either —
 * Shortcuts wraps the body differently depending on how it is built.
 */
export function normalizePushedReminders(payload: unknown): NormalizedPush {
  let source = payload;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      return { valid: false, items: [], received: 0, skipped: 0 };
    }
  }

  const list = coerceList(source);
  if (!list) return { valid: false, items: [], received: 0, skipped: 0 };

  const items: ReminderItem[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const entry of list) {
    const record = coerceReminderEntry(entry);
    if (!record) {
      skipped += 1;
      continue;
    }

    const item = reminderFromRecord(record);
    if (!item) {
      skipped += 1;
      continue;
    }

    const dedupeKey = item.id.toLowerCase();
    if (seen.has(dedupeKey)) {
      skipped += 1;
      continue;
    }
    seen.add(dedupeKey);
    items.push(item);

    if (items.length >= MAX_ITEMS) break;
  }

  return { valid: true, items, received: list.length, skipped };
}

/**
 * Repair an already-stored item whose title is a stringified Dictionary.
 * Safe no-op when the title is a normal string.
 */
export function sanitizeReminderItem(item: ReminderItem): ReminderItem {
  const nested = tryParseJsonObject(item.title);
  if (!nested) {
    // Also peel if notes somehow held the blob (defensive).
    return item;
  }

  const rebuilt = reminderFromRecord({
    ...nested,
    // Prefer nested identity; keep outer id if nested lacks one.
    id: nested.id ?? nested.identifier ?? nested.uuid ?? item.id,
    listName:
      nested.listName ??
      nested.list ??
      nested.lista ??
      nested.elenco ??
      item.listName,
    dueAt: nested.dueAt ?? nested.due ?? nested.dueDate ?? item.dueAt,
    notes: nested.notes ?? nested.note ?? item.notes,
  });

  return rebuilt ?? item;
}

/** Sanitize a list; returns whether any item changed. */
export function sanitizeReminderItems(items: ReminderItem[]): {
  items: ReminderItem[];
  changed: boolean;
} {
  let changed = false;
  const next = items.map((item) => {
    const cleaned = sanitizeReminderItem(item);
    if (
      cleaned.title !== item.title ||
      cleaned.listName !== item.listName ||
      cleaned.dueAt !== item.dueAt ||
      cleaned.notes !== item.notes ||
      cleaned.id !== item.id
    ) {
      changed = true;
    }
    return cleaned;
  });
  return { items: next, changed };
}
