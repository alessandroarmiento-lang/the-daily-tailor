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
  /** Raw dueAt present (non-empty) before parse. */
  dueAtRawPresent: number;
  /** Items whose dueAt parsed to ISO. */
  dueAtParsed: number;
  /** Up to 3 raw dueAt samples for diagnosis (truncated). */
  dueAtSamples: string[];
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

const ITALIAN_MONTHS: Record<string, number> = {
  gen: 1,
  gennaio: 1,
  feb: 2,
  febbraio: 2,
  mar: 3,
  marzo: 3,
  apr: 4,
  aprile: 4,
  mag: 5,
  maggio: 5,
  giu: 6,
  giugno: 6,
  lug: 7,
  luglio: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  sett: 9,
  settembre: 9,
  ott: 10,
  ottobre: 10,
  nov: 11,
  novembre: 11,
  dic: 12,
  dicembre: 12,
};

function composeLocalIso(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
): string | null {
  const composed = new Date(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(
      2,
      "0",
    )}:${minute.padStart(2, "0")}:00`,
  );
  return Number.isNaN(composed.getTime()) ? null : composed.toISOString();
}

/**
 * Shortcuts custom format `XXXXX` emits `+01:00:00`; JS Date rejects that.
 * Collapse to `+01:00`. Also accept `+0100` / `+01`.
 */
export function normalizeIsoOffset(text: string): string {
  return text.replace(
    /([+-])(\d{2})(?::?(\d{2}))?(?::\d{2})?$/,
    (_, sign: string, hh: string, mm: string | undefined) =>
      `${sign}${hh}:${mm ?? "00"}`,
  );
}

/**
 * ISO 8601 preferred (Shortcuts: Formatta data → `yyyy-MM-dd'T'HH:mm:ssXXX`).
 * Also tolerates epoch, `XXXXX` offsets, `gg/mm/aaaa`, and Italian long dates
 * (`1 novembre 2026 alle 19:00`) when Format Date falls back to locale text.
 */
export function parseDueAt(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of [
      "dueAt",
      "due",
      "dueDate",
      "date",
      "iso",
      "ISO8601",
      "stringValue",
    ]) {
      if (record[key] !== undefined && record[key] !== value) {
        const nested = parseDueAt(record[key]);
        if (nested) return nested;
      }
    }
    return null;
  }

  const text = String(value).trim();
  if (!text || text === "[object Object]") return null;

  // dd/mm/yyyy before Date.parse — JS reads 01/11/2026 as 11 January.
  const slash =
    /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/.exec(text);
  if (slash) {
    const [, d, m, y, hh, mm] = slash;
    return composeLocalIso(y, m, d, hh ?? "09", mm ?? "00");
  }

  // "sabato 1 novembre 2026 alle ore 19:00" / "1 nov. 2026, 19:00"
  const named =
    /^(?:[a-zàèéìòù]+\s+)?(\d{1,2})\s+([a-zàèéìòù.]+)\s+(\d{4})(?:[,\s]+(?:alle?(?:\s+ore)?\s+)?(\d{1,2})[:.](\d{2}))?/i.exec(
      text,
    );
  if (named) {
    const [, d, monthRaw, y, hh, mm] = named;
    const month = ITALIAN_MONTHS[monthRaw.replace(/\./g, "").toLowerCase()];
    if (month) {
      return composeLocalIso(y, String(month), d, hh ?? "09", mm ?? "00");
    }
  }

  const normalized = normalizeIsoOffset(text);
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  return null;
}

function parsePriority(value: unknown): ReminderPriority {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Apple Reminders: 0 none, 1–4 high, 5–8 medium, 9 low (EventKit).
    // iCalendar PRIORITY: 1–4 high, 5 medium, 6–9 low, 0 undefined.
    if (value <= 0) return "none";
    if (value <= 4) return "high";
    if (value <= 8) return "medium";
    return "low";
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "none";
  if (/^\d+$/.test(text)) return parsePriority(Number(text));
  if (
    text.startsWith("alt") ||
    text.startsWith("high") ||
    text === "!!!" ||
    text === "urgent"
  ) {
    return "high";
  }
  if (text.startsWith("med") || text === "!!") return "medium";
  if (
    text.startsWith("bas") ||
    text.startsWith("low") ||
    text === "!" ||
    text.startsWith("ness") ||
    text === "none" ||
    text === "no"
  ) {
    // "nessuna" / none → none; "!" alone is low in some UIs.
    if (text.startsWith("ness") || text === "none" || text === "no") {
      return "none";
    }
    return "low";
  }
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

function emptyNormalized(valid: boolean): NormalizedPush {
  return {
    valid,
    items: [],
    received: 0,
    skipped: 0,
    dueAtRawPresent: 0,
    dueAtParsed: 0,
    dueAtSamples: [],
  };
}

function sampleDueRaw(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t.slice(0, 80) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value).slice(0, 80);
    } catch {
      return "[object]";
    }
  }
  const t = String(value).trim();
  return t ? t.slice(0, 80) : null;
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
      return emptyNormalized(false);
    }
  }

  const list = coerceList(source);
  if (!list) return emptyNormalized(false);

  const items: ReminderItem[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let dueAtRawPresent = 0;
  let dueAtParsed = 0;
  const dueAtSamples: string[] = [];

  for (const entry of list) {
    const record = coerceReminderEntry(entry);
    if (!record) {
      skipped += 1;
      continue;
    }

    const get = reader(peelStringifiedTitleFields(record));
    const rawDue = get(["dueat", "due", "duedate", "scadenza", "data"]);
    const rawSample = sampleDueRaw(rawDue);
    if (rawSample) {
      dueAtRawPresent += 1;
      if (dueAtSamples.length < 3) dueAtSamples.push(rawSample);
    }

    const item = reminderFromRecord(record);
    if (!item) {
      skipped += 1;
      continue;
    }

    if (item.dueAt) dueAtParsed += 1;

    const dedupeKey = item.id.toLowerCase();
    if (seen.has(dedupeKey)) {
      skipped += 1;
      continue;
    }
    seen.add(dedupeKey);
    items.push(item);

    if (items.length >= MAX_ITEMS) break;
  }

  return {
    valid: true,
    items,
    received: list.length,
    skipped,
    dueAtRawPresent,
    dueAtParsed,
    dueAtSamples,
  };
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
    priority: nested.priority ?? nested.priorita ?? nested.priorità ?? item.priority,
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
      cleaned.id !== item.id ||
      cleaned.priority !== item.priority
    ) {
      changed = true;
    }
    return cleaned;
  });
  return { items: next, changed };
}
