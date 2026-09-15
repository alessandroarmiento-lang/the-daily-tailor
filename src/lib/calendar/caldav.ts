/**
 * Headless CalDAV calendar — iCloud (+ optional Google CalDAV).
 * Works with Mac powered off when app passwords / credentials are set.
 */
import { createDAVClient, type DAVCalendar } from "tsdav";
import ical from "node-ical";
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import type { CalendarAdapter, CalendarEventItem } from "./types";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

type CalDavAccount = {
  id: string;
  label: string;
  serverUrl: string;
  username: string;
  password: string;
};

export function configuredCalDavAccounts(): CalDavAccount[] {
  const accounts: CalDavAccount[] = [];

  const icloudUser =
    env("ICLOUD_CALDAV_USER") || env("ICLOUD_MAIL_USER");
  const icloudPass =
    env("ICLOUD_CALDAV_APP_PASSWORD") || env("ICLOUD_MAIL_APP_PASSWORD");
  if (icloudUser && icloudPass) {
    accounts.push({
      id: "icloud",
      label: "iCloud Calendar",
      serverUrl: env("ICLOUD_CALDAV_URL") || "https://caldav.icloud.com",
      username: icloudUser,
      password: icloudPass.replace(/\s+/g, ""),
    });
  }

  const googleUser =
    env("GOOGLE_CALDAV_USER") || env("GMAIL_USER") || env("GOOGLE_MAIL_USER");
  const googlePass =
    env("GOOGLE_CALDAV_APP_PASSWORD") ||
    env("GMAIL_APP_PASSWORD") ||
    env("GOOGLE_MAIL_APP_PASSWORD");
  // Google CalDAV often needs OAuth; app-password path is best-effort.
  if (googleUser && googlePass && env("GOOGLE_CALDAV_URL")) {
    accounts.push({
      id: "google",
      label: "Google Calendar (CalDAV)",
      serverUrl: env("GOOGLE_CALDAV_URL"),
      username: googleUser,
      password: googlePass.replace(/\s+/g, ""),
    });
  }

  return accounts;
}

export function hasCalDavCredentials(): boolean {
  return configuredCalDavAccounts().length > 0;
}

function horizonBounds(horizonDays: number): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + horizonDays);
  return { start, end };
}

type IcalEvent = {
  type?: string;
  summary?: string;
  uid?: string;
  location?: string;
  start?: Date & { dateOnly?: boolean };
  end?: Date;
};

function parseEventsFromIcs(
  ics: string,
  calendarName: string,
  start: Date,
  end: Date,
): CalendarEventItem[] {
  const parsed = ical.sync.parseICS(ics);
  const items: CalendarEventItem[] = [];

  for (const value of Object.values(parsed)) {
    if (!value || typeof value !== "object") continue;
    const ev = value as IcalEvent;
    if (ev.type !== "VEVENT") continue;

    const summary = (ev.summary ? String(ev.summary) : "") || "(senza titolo)";
    const uid = (ev.uid ? String(ev.uid) : "") || summary;
    const loc = ev.location ? String(ev.location) : null;

    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    let isAllDay = false;

    if (ev.start) {
      const s = ev.start;
      startsAt = s instanceof Date ? s : new Date(String(s));
      isAllDay = Boolean(s.dateOnly === true);
    }
    if (ev.end) {
      const e = ev.end;
      endsAt = e instanceof Date ? e : new Date(String(e));
    }

    if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
    if (startsAt < start || startsAt >= end) continue;

    items.push({
      id: uid,
      title: summary,
      location: loc,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt && !Number.isNaN(endsAt.getTime())
        ? endsAt.toISOString()
        : null,
      isAllDay,
      calendarName,
    });
  }

  return items;
}

async function fetchAccountEvents(
  account: CalDavAccount,
  start: Date,
  end: Date,
): Promise<{ items: CalendarEventItem[]; error?: string }> {
  try {
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
    const items: CalendarEventItem[] = [];

    for (const cal of calendars as DAVCalendar[]) {
      const name =
        (cal.displayName && String(cal.displayName)) ||
        account.label;

      // Skip pure VTODO reminder lists when components advertise only todos.
      const components = (cal.components || []).map(String);
      if (
        components.length > 0 &&
        components.every((c) => c.toUpperCase() === "VTODO")
      ) {
        continue;
      }

      try {
        const objects = await client.fetchCalendarObjects({
          calendar: cal,
          timeRange: { start: start.toISOString(), end: end.toISOString() },
        });
        for (const obj of objects) {
          const data = typeof obj.data === "string" ? obj.data : "";
          if (!data) continue;
          items.push(...parseEventsFromIcs(data, name, start, end));
        }
      } catch {
        // skip calendar
      }
    }

    return { items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { items: [], error: `${account.label}: ${message}` };
  }
}

export class CalDavCalendarAdapter implements CalendarAdapter {
  readonly id = "caldav";
  label = "CalDAV (iCloud)";

  async getUpcomingEvents(horizonDays: number): Promise<CalendarEventItem[]> {
    const cached =
      await readEditionCacheEnvelope<CalendarEventItem[]>("calendar");
    if (cached?.data) return cached.data;

    const accounts = configuredCalDavAccounts();
    if (accounts.length === 0) {
      throw new Error(
        "CalDAV non configurato: imposta ICLOUD_CALDAV_USER + ICLOUD_CALDAV_APP_PASSWORD (o riusa ICLOUD_MAIL_*)",
      );
    }

    const { start, end } = horizonBounds(horizonDays);
    const all: CalendarEventItem[] = [];
    const errors: string[] = [];
    const labels: string[] = [];

    for (const account of accounts) {
      const result = await fetchAccountEvents(account, start, end);
      if (result.error) errors.push(result.error);
      else labels.push(account.label);
      all.push(...result.items);
    }

    if (all.length === 0 && errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    all.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    this.label =
      labels.length > 0 ? `CalDAV (${labels.join(" + ")})` : this.label;

    await writeEditionCache("calendar", all);
    return all;
  }
}
