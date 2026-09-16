/**
 * Pushed reminders snapshot (iPhone Shortcut → POST /api/reminders/ingest).
 *
 * Apple Reminders live in CloudKit: iCloud CalDAV exposes an empty VTODO stub,
 * so a Mac-off host cannot read them. The phone pushes the open list once a day
 * and the edition reads the snapshot back from the editions volume.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReminderItem, ReminderPriority } from "./types";

export const PUSHED_REMINDERS_SCHEMA_VERSION = 1;
export const DEFAULT_PUSH_MAX_AGE_HOURS = 36;
export const PUSHED_DEVICE_LABEL = "iPhone";

/** Guard rails so a malformed push cannot fill the volume. */
const MAX_ITEMS = 200;
const MAX_TITLE_CHARS = 300;
const MAX_NOTES_CHARS = 500;
const MAX_LIST_CHARS = 80;

export type PushedRemindersSnapshot = {
  schemaVersion: number;
  receivedAt: string;
  deviceLabel: string;
  items: ReminderItem[];
};

export type NormalizedPush = {
  /** False when the body is not a reminders list at all (bad request). */
  valid: boolean;
  items: ReminderItem[];
  /** Entries in the payload, before filtering. */
  received: number;
  /** Dropped: completed, untitled, or duplicated. */
  skipped: number;
};

function snapshotRoot(): string {
  const override = process.env.EDITIONS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data", "editions");
}

function snapshotPath(): string {
  return path.join(snapshotRoot(), "pushed-reminders.json");
}

export function pushedSnapshotMaxAgeHours(): number {
  const raw = Number(process.env.REMINDERS_PUSH_MAX_AGE_HOURS ?? "");
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_PUSH_MAX_AGE_HOURS;
}

function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Case-insensitive field reader — Shortcuts writes keys like `Titolo`. */
function reader(raw: Record<string, unknown>): (keys: string[]) => unknown {
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
function parseDueAt(value: unknown): string | null {
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

/** Shortcuts flattens a reminders variable to one title per line. */
function splitTitleLines(value: string): string[] | null {
  const lines = value
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
      const lines = splitTitleLines(value);
      if (lines) return lines;
    }
  }
  return null;
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
    // A bare string is a title-only reminder (flattened Shortcuts variable).
    const record =
      typeof entry === "string" && entry.trim()
        ? { title: entry }
        : entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : null;
    if (!record) {
      skipped += 1;
      continue;
    }
    const get = reader(record);

    if (parseCompleted(get(["iscompleted", "completed", "completato"]))) {
      skipped += 1;
      continue;
    }

    const title = clampText(
      get(["title", "titolo", "name", "nome", "summary"]),
      MAX_TITLE_CHARS,
    );
    if (!title) {
      skipped += 1;
      continue;
    }

    const listName =
      clampText(
        get(["listname", "list", "lista", "elenco", "calendar"]),
        MAX_LIST_CHARS,
      ) || "Promemoria";

    const rawId = clampText(get(["id", "identifier", "uuid"]), 200);
    const dedupeKey = (
      rawId || `${listName}|${title}`
    ).toLowerCase();
    if (seen.has(dedupeKey)) {
      skipped += 1;
      continue;
    }
    seen.add(dedupeKey);

    items.push({
      id: rawId || `push-${dedupeKey}`,
      title,
      notes:
        clampText(get(["notes", "note", "body", "description"]), MAX_NOTES_CHARS) ||
        null,
      listName,
      dueAt: parseDueAt(get(["dueat", "due", "duedate", "scadenza", "data"])),
      isCompleted: false,
      priority: parsePriority(get(["priority", "priorita", "priorità"])),
    });

    if (items.length >= MAX_ITEMS) break;
  }

  return { valid: true, items, received: list.length, skipped };
}

export async function savePushedReminders(
  items: ReminderItem[],
  deviceLabel = PUSHED_DEVICE_LABEL,
): Promise<PushedRemindersSnapshot> {
  const snapshot: PushedRemindersSnapshot = {
    schemaVersion: PUSHED_REMINDERS_SCHEMA_VERSION,
    receivedAt: new Date().toISOString(),
    deviceLabel: clampText(deviceLabel, 40) || PUSHED_DEVICE_LABEL,
    items,
  };

  const root = snapshotRoot();
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
  await writeFile(
    snapshotPath(),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
  return snapshot;
}

export async function loadPushedReminders(): Promise<PushedRemindersSnapshot | null> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const parsed = JSON.parse(raw) as PushedRemindersSnapshot;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (typeof parsed.receivedAt !== "string") return null;
    return {
      schemaVersion: parsed.schemaVersion ?? PUSHED_REMINDERS_SCHEMA_VERSION,
      receivedAt: parsed.receivedAt,
      deviceLabel: parsed.deviceLabel || PUSHED_DEVICE_LABEL,
      items: parsed.items,
    };
  } catch {
    return null;
  }
}

export function pushedSnapshotAgeHours(
  snapshot: PushedRemindersSnapshot,
  now: Date = new Date(),
): number {
  const received = new Date(snapshot.receivedAt).getTime();
  if (Number.isNaN(received)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - received) / 3_600_000);
}

export function isPushedSnapshotFresh(
  snapshot: PushedRemindersSnapshot,
  now: Date = new Date(),
): boolean {
  return pushedSnapshotAgeHours(snapshot, now) < pushedSnapshotMaxAgeHours();
}
