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
import { rankReminders, remindersFetchPool } from "./rank";
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
): ReminderItem[] {
  const parsed = ical.sync.parseICS(ics);
  const items: ReminderItem[] = [];

  for (const value of Object.values(parsed)) {
    if (!value || typeof value !== "object") continue;
    const todo = value as IcalTodo;
    if (todo.type !== "VTODO") continue;

    const status = todo.status ? String(todo.status).toUpperCase() : "";
    if (status === "COMPLETED") continue;

    let title = (todo.summary ? String(todo.summary) : "") || "(senza titolo)";
    const uid = (todo.uid ? String(todo.uid) : "") || title;
    const notes = todo.description
      ? String(todo.description).slice(0, 200)
      : null;

    let dueAt: string | null = null;
    // All incomplete todos (undated, overdue, today, future) — soft-capped later.
    if (todo.due) {
      const dueDate =
        todo.due instanceof Date ? todo.due : new Date(String(todo.due));
      if (!Number.isNaN(dueDate.getTime())) {
        dueAt = dueDate.toISOString();
      }
    }

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
    const poolSize = remindersFetchPool(config.reminders.maxItems);
    const cached = await readEditionCacheEnvelope<ReminderItem[]>("reminders");
    if (cached?.data) {
      return rankReminders(cached.data).slice(0, poolSize);
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
          items.push(...parseTodos(data, name));
        }
      } catch {
        // skip
      }
    }

    const ranked = rankReminders(items).slice(0, poolSize);
    await writeEditionCache("reminders", ranked);
    return ranked;
  }
}
