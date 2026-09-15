/**
 * Headless CalDAV reminders (VTODO) — iCloud.
 * Works with Mac powered off when CalDAV app password is set.
 */
import { createDAVClient, type DAVCalendar } from "tsdav";
import ical from "node-ical";
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import type { ReminderItem, RemindersAdapter } from "./types";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

type CalDavAccount = {
  label: string;
  serverUrl: string;
  username: string;
  password: string;
};

function icloudAccount(): CalDavAccount | null {
  const username =
    env("ICLOUD_CALDAV_USER") || env("ICLOUD_MAIL_USER");
  const password = (
    env("ICLOUD_CALDAV_APP_PASSWORD") || env("ICLOUD_MAIL_APP_PASSWORD")
  ).replace(/\s+/g, "");
  if (!username || !password) return null;
  return {
    label: "iCloud Reminders",
    serverUrl: env("ICLOUD_CALDAV_URL") || "https://caldav.icloud.com",
    username,
    password,
  };
}

export function hasRemindersCalDavCredentials(): boolean {
  return icloudAccount() !== null;
}

function todayBounds(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function priorityFromIcal(n: number | undefined): ReminderItem["priority"] {
  if (n === undefined || n === 0) return "none";
  if (n <= 3) return "high";
  if (n <= 6) return "medium";
  return "low";
}

type IcalTodo = {
  type?: string;
  status?: string;
  summary?: string;
  uid?: string;
  description?: string;
  due?: Date;
  priority?: number;
};

function parseTodos(
  ics: string,
  listName: string,
  start: Date,
  end: Date,
): ReminderItem[] {
  const parsed = ical.sync.parseICS(ics);
  const items: ReminderItem[] = [];

  for (const value of Object.values(parsed)) {
    if (!value || typeof value !== "object") continue;
    const todo = value as IcalTodo;
    if (todo.type !== "VTODO") continue;

    const status = todo.status ? String(todo.status).toUpperCase() : "";
    if (status === "COMPLETED") continue;

    const title = (todo.summary ? String(todo.summary) : "") || "(senza titolo)";
    const uid = (todo.uid ? String(todo.uid) : "") || title;
    const notes = todo.description
      ? String(todo.description).slice(0, 200)
      : null;

    let dueAt: string | null = null;
    let dueOk = true; // undated open todos count as today/open

    if (todo.due) {
      const dueDate =
        todo.due instanceof Date ? todo.due : new Date(String(todo.due));
      if (!Number.isNaN(dueDate.getTime())) {
        dueAt = dueDate.toISOString();
        dueOk = dueDate >= start && dueDate < end;
      }
    }

    if (!dueOk) continue;

    const prio =
      typeof todo.priority === "number"
        ? priorityFromIcal(todo.priority)
        : "none";

    items.push({
      id: uid,
      title,
      notes,
      listName,
      dueAt,
      isCompleted: false,
      priority: prio,
    });
  }

  return items;
}

export class CalDavRemindersAdapter implements RemindersAdapter {
  readonly id = "caldav";
  label = "CalDAV (iCloud Reminders)";

  async getTodaysOpenReminders(): Promise<ReminderItem[]> {
    const cached = await readEditionCacheEnvelope<ReminderItem[]>("reminders");
    if (cached?.data) {
      return cached.data.slice(0, config.reminders.maxItems);
    }

    const account = icloudAccount();
    if (!account) {
      throw new Error(
        "CalDAV Reminders non configurato: imposta ICLOUD_CALDAV_* o ICLOUD_MAIL_*",
      );
    }

    const client = await createDAVClient({
      serverUrl: account.serverUrl,
      credentials: {
        username: account.username,
        password: account.password,
      },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    const calendars = await client.fetchCalendars();
    const { start, end } = todayBounds();
    const items: ReminderItem[] = [];

    for (const cal of calendars as DAVCalendar[]) {
      const name =
        (cal.displayName && String(cal.displayName)) || account.label;
      const components = (cal.components || []).map((c) =>
        String(c).toUpperCase(),
      );
      // Prefer lists that include VTODO; also try all if components unknown.
      if (components.length > 0 && !components.includes("VTODO")) continue;

      try {
        const objects = await client.fetchCalendarObjects({
          calendar: cal,
        });
        for (const obj of objects) {
          const data = typeof obj.data === "string" ? obj.data : "";
          if (!data || !/BEGIN:VTODO/i.test(data)) continue;
          items.push(...parseTodos(data, name, start, end));
        }
      } catch {
        // skip
      }
    }

    const capped = items.slice(0, config.reminders.maxItems);
    await writeEditionCache("reminders", capped);
    return capped;
  }
}
