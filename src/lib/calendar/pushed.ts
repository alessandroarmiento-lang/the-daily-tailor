import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CalendarEventItem } from "./types";

export const PUSHED_CALENDAR_SCHEMA = 1;
const MAX_AGE_HOURS = 36;

export type PushedCalendarSnapshot = {
  schemaVersion: number;
  receivedAt: string;
  deviceLabel: string;
  events: CalendarEventItem[];
};

function snapshotRoot(): string {
  const override = process.env.EDITIONS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data", "editions");
}

function snapshotPath(): string {
  return path.join(snapshotRoot(), "pushed-calendar.json");
}

export async function savePushedCalendar(
  events: CalendarEventItem[],
  deviceLabel = "Mac",
): Promise<PushedCalendarSnapshot> {
  const snapshot: PushedCalendarSnapshot = {
    schemaVersion: PUSHED_CALENDAR_SCHEMA,
    receivedAt: new Date().toISOString(),
    deviceLabel: deviceLabel.slice(0, 40) || "Mac",
    events,
  };
  const root = snapshotRoot();
  await mkdir(root, { recursive: true });
  await writeFile(snapshotPath(), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

export async function loadPushedCalendar(): Promise<PushedCalendarSnapshot | null> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const parsed = JSON.parse(raw) as PushedCalendarSnapshot;
    if (parsed?.schemaVersion !== PUSHED_CALENDAR_SCHEMA) return null;
    if (!Array.isArray(parsed.events)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isPushedCalendarFresh(snapshot: PushedCalendarSnapshot): boolean {
  const age = Date.now() - Date.parse(snapshot.receivedAt);
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE_HOURS * 3_600_000;
}
