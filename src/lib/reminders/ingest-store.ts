/**
 * Pushed reminders snapshot (iPhone Shortcut → POST /api/reminders/ingest).
 *
 * Apple Reminders live in CloudKit: iCloud CalDAV exposes an empty VTODO stub,
 * so a Mac-off host cannot read them. The phone pushes the open list once a day
 * and the edition reads the snapshot back from the editions volume.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReminderItem } from "./types";
import {
  clampText,
  normalizePushedReminders,
  sanitizeReminderItems,
  type NormalizedPush,
} from "./normalize-push";

export const PUSHED_REMINDERS_SCHEMA_VERSION = 1;
export const DEFAULT_PUSH_MAX_AGE_HOURS = 36;
export const PUSHED_DEVICE_LABEL = "iPhone";

export type PushedRemindersSnapshot = {
  schemaVersion: number;
  receivedAt: string;
  deviceLabel: string;
  items: ReminderItem[];
  /** Last ingest dueAt diagnostics (no reminder bodies). */
  dueAtDiagnostics?: {
    rawPresent: number;
    parsed: number;
    samples: string[];
  };
};

export type { NormalizedPush };
export { normalizePushedReminders, sanitizeReminderItem, sanitizeReminderItems } from "./normalize-push";

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

export async function savePushedReminders(
  items: ReminderItem[],
  deviceLabel = PUSHED_DEVICE_LABEL,
  dueAtDiagnostics?: PushedRemindersSnapshot["dueAtDiagnostics"],
): Promise<PushedRemindersSnapshot> {
  const snapshot: PushedRemindersSnapshot = {
    schemaVersion: PUSHED_REMINDERS_SCHEMA_VERSION,
    receivedAt: new Date().toISOString(),
    deviceLabel: clampText(deviceLabel, 40) || PUSHED_DEVICE_LABEL,
    items,
    ...(dueAtDiagnostics ? { dueAtDiagnostics } : {}),
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

    const { items, changed } = sanitizeReminderItems(parsed.items);
    const snapshot: PushedRemindersSnapshot = {
      schemaVersion: parsed.schemaVersion ?? PUSHED_REMINDERS_SCHEMA_VERSION,
      receivedAt: parsed.receivedAt,
      deviceLabel: parsed.deviceLabel || PUSHED_DEVICE_LABEL,
      items,
      ...(parsed.dueAtDiagnostics
        ? { dueAtDiagnostics: parsed.dueAtDiagnostics }
        : {}),
    };

    // Persist repair so the next warm / UI read sees clean titles.
    if (changed) {
      try {
        await writeFile(
          snapshotPath(),
          `${JSON.stringify(snapshot, null, 2)}\n`,
          "utf8",
        );
      } catch {
        // Read path still returns sanitized items even if rewrite fails.
      }
    }

    return snapshot;
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
