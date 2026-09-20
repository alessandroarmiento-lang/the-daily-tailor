/**
 * Headless CalDAV calendar — iCloud (+ Google legacy CalDAV).
 * Works with Mac powered off when app passwords / credentials are set.
 *
 * Google: tsdav principal discovery fails on calendar.google.com; we PROPFIND
 * the legacy home `/calendar/dav/<user>/` then REPORT every `/events/`
 * collection (primary, shared, holidays, …) plus Compleanni, with Basic
 * (Gmail app password). Reminders/VTODO lists are skipped.
 */
import { createDAVClient, type DAVCalendar } from "tsdav";
import ical, { expandRecurringEvent } from "node-ical";
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import {
  birthdayEventsForHorizon,
  loadContactBirthdays,
} from "@/lib/contacts/carddav";
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
  /** Bypass tsdav login; use calendar-query REPORT on serverUrl. */
  transport: "tsdav" | "google-legacy";
};

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function icalUtcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Civil YYYY-MM-DD in `timeZone` for an Instant. */
function dateKeyInTz(isoOrDate: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(isoOrDate);
}

/**
 * Midnight at the start of `dateKey` (YYYY-MM-DD) in `timeZone`, as UTC Date.
 * Avoids Fly's UTC `setHours(0,0,0,0)` shifting the Rome day.
 */
function zonedDayStart(dateKey: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Probe UTC noon on that civil date, then subtract the zone offset.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const inTz = new Date(
    probe.toLocaleString("en-US", { timeZone }),
  );
  const asUtc = new Date(
    probe.toLocaleString("en-US", { timeZone: "UTC" }),
  );
  const offsetMs = asUtc.getTime() - inTz.getTime();
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMs);
}

function addCivilDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12));
  return utc.toISOString().slice(0, 10);
}

function horizonBounds(horizonDays: number): { start: Date; end: Date } {
  const tz = config.timezone;
  const todayKey = dateKeyInTz(new Date(), tz);
  const endKey = addCivilDays(todayKey, horizonDays);
  return {
    start: zonedDayStart(todayKey, tz),
    end: zonedDayStart(endKey, tz),
  };
}

type IcalEvent = {
  type?: string;
  summary?: string;
  uid?: string;
  location?: string;
  start?: Date & { dateOnly?: boolean };
  end?: Date;
  rrule?: { between: (a: Date, b: Date, inclusive?: boolean) => Date[] };
  exdate?: Record<string, Date>;
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

    // Recurring masters: expand into the window (EXDATE / RECURRENCE-ID).
    // Without this, yearly/weekly events vanish from Agenda.
    if (ev.rrule) {
      try {
        const instances = expandRecurringEvent(ev as never, {
          from: start,
          to: end,
        });
        for (const inst of instances) {
          const startsAt = inst.start;
          if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
            continue;
          }
          if (startsAt < start || startsAt >= end) continue;
          items.push({
            id: `${uid}|${startsAt.toISOString()}`,
            title: (inst.summary ? String(inst.summary) : summary) || summary,
            location: loc,
            startsAt: startsAt.toISOString(),
            endsAt:
              inst.end && !Number.isNaN(inst.end.getTime())
                ? inst.end.toISOString()
                : null,
            isAllDay: Boolean(inst.isFullDay),
            calendarName,
          });
        }
        continue;
      } catch {
        // fall through to one-shot parse
      }
    }

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

function defaultGoogleHomeUrl(username: string): string {
  return `https://www.google.com/calendar/dav/${encodeURIComponent(username)}/`;
}

function defaultGoogleEventsUrl(username: string): string {
  return `${defaultGoogleHomeUrl(username)}events/`;
}

/** Google Contacts birthdays — not listed under the primary home PROPFIND. */
function googleBirthdaysEventsUrl(): string {
  return "https://www.google.com/calendar/dav/addressbook%23contacts%40group.v.calendar.google.com/events/";
}

function absoluteGoogleDavUrl(href: string, username: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/")) return `https://www.google.com${href}`;
  return `${defaultGoogleHomeUrl(username)}${href}`;
}

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
      transport: "tsdav",
    });
  }

  const googleUser =
    env("GOOGLE_CALDAV_USER") || env("GMAIL_USER") || env("GOOGLE_MAIL_USER");
  const googlePass =
    env("GOOGLE_CALDAV_APP_PASSWORD") ||
    env("GMAIL_APP_PASSWORD") ||
    env("GOOGLE_MAIL_APP_PASSWORD");
  if (googleUser && googlePass) {
    const pass = googlePass.replace(/\s+/g, "");
    accounts.push({
      id: "google",
      label: "Google Calendar",
      // Home URL: fetch discovers every /events/ collection (primary, shared,
      // holidays, …) plus Compleanni. GOOGLE_CALDAV_URL can force a single
      // collection for debugging.
      serverUrl: env("GOOGLE_CALDAV_URL") || defaultGoogleHomeUrl(googleUser),
      username: googleUser,
      password: pass,
      transport: "google-legacy",
    });
  }

  return accounts;
}

export function hasCalDavCredentials(): boolean {
  return configuredCalDavAccounts().length > 0;
}

function decodeCalendarDataXml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

type GoogleCollection = { url: string; name: string };

function parseGooglePropfindCollections(
  xml: string,
  username: string,
): GoogleCollection[] {
  const blocks = [
    ...xml.matchAll(
      /<(?:[\w.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?response>/gi,
    ),
  ].map((m) => m[1]);

  const out: GoogleCollection[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const hrefMatch = block.match(
      /<(?:[\w.-]+:)?href[^>]*>([^<]+)<\/(?:[\w.-]+:)?href>/i,
    );
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();
    const lower = href.toLowerCase();
    if (!lower.includes("/events")) continue;
    if (lower.endsWith("/user") || lower.includes("/inbox") || lower.includes("/outbox")) {
      continue;
    }

    // Skip pure VTODO collections when advertised.
    const comps = [
      ...block.matchAll(
        /<(?:[\w.-]+:)?comp\b[^>]*name=["']([^"']+)["']/gi,
      ),
    ].map((m) => m[1].toUpperCase());
    if (
      comps.length > 0 &&
      comps.every((c) => c === "VTODO")
    ) {
      continue;
    }

    const nameMatch = block.match(
      /<(?:[\w.-]+:)?displayname[^>]*>([^<]*)<\/(?:[\w.-]+:)?displayname>/i,
    );
    const name = (nameMatch?.[1] || "").trim() || username;
    let url = absoluteGoogleDavUrl(href, username);
    if (!url.endsWith("/")) url = `${url}/`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, name });
  }

  return out;
}

async function discoverGoogleLegacyCollections(
  account: CalDavAccount,
): Promise<GoogleCollection[]> {
  const username = account.username;
  const birthdays: GoogleCollection = {
    url: googleBirthdaysEventsUrl(),
    name: "Compleanni",
  };
  const primary: GoogleCollection = {
    url: defaultGoogleEventsUrl(username),
    name: username || account.label,
  };

  // Explicit single-collection override (debug / forced URL ending in /events/).
  const server = account.serverUrl;
  if (/\/events\/?$/i.test(server)) {
    const url = server.endsWith("/") ? server : `${server}/`;
    return [
      { url, name: username || account.label },
      birthdays,
    ];
  }

  const home = server.endsWith("/") ? server : `${server}/`;
  const byUrl = new Map<string, GoogleCollection>();

  const add = (c: GoogleCollection) => {
    const url = c.url.endsWith("/") ? c.url : `${c.url}/`;
    if (!byUrl.has(url)) byUrl.set(url, { ...c, url });
  };

  try {
    const res = await fetch(home, {
      method: "PROPFIND",
      headers: {
        Authorization: basicAuthHeader(account.username, account.password),
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <c:supported-calendar-component-set/>
    <cs:getctag/>
  </d:prop>
</d:propfind>`,
    });
    const xml = await res.text();
    if (res.ok || res.status === 207) {
      for (const c of parseGooglePropfindCollections(xml, username)) {
        add(c);
      }
    }
  } catch {
    // fall through — still return primary + birthdays
  }

  add(primary);
  add(birthdays);
  return [...byUrl.values()];
}

async function reportGoogleCollection(
  account: CalDavAccount,
  collection: GoogleCollection,
  start: Date,
  end: Date,
): Promise<{ items: CalendarEventItem[]; error?: string }> {
  try {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${icalUtcStamp(start)}" end="${icalUtcStamp(end)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

    const res = await fetch(collection.url, {
      method: "REPORT",
      headers: {
        Authorization: basicAuthHeader(account.username, account.password),
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body,
    });
    const xml = await res.text();
    if (!res.ok && res.status !== 207) {
      return {
        items: [],
        error: `${account.label}/${collection.name}: HTTP ${res.status}`,
      };
    }

    const blocks = [
      ...xml.matchAll(
        /<(?:[\w.-]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?calendar-data>/gi,
      ),
    ].map((m) => decodeCalendarDataXml(m[1]));

    const items: CalendarEventItem[] = [];
    for (const ics of blocks) {
      if (!ics.trim()) continue;
      items.push(...parseEventsFromIcs(ics, collection.name, start, end));
    }
    return { items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { items: [], error: `${account.label}/${collection.name}: ${message}` };
  }
}

async function fetchGoogleLegacyEvents(
  account: CalDavAccount,
  start: Date,
  end: Date,
): Promise<{ items: CalendarEventItem[]; error?: string }> {
  const collections = await discoverGoogleLegacyCollections(account);
  const all: CalendarEventItem[] = [];
  const errors: string[] = [];
  let okCount = 0;

  for (const collection of collections) {
    const result = await reportGoogleCollection(account, collection, start, end);
    if (result.error) errors.push(result.error);
    else okCount += 1;
    all.push(...result.items);
  }

  if (all.length === 0 && errors.length > 0 && okCount === 0) {
    return { items: [], error: errors.join("; ") };
  }
  // Partial success is fine (e.g. one shared calendar 404).
  return { items: all };
}

async function fetchTsdavAccountEvents(
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

async function fetchAccountEvents(
  account: CalDavAccount,
  start: Date,
  end: Date,
): Promise<{ items: CalendarEventItem[]; error?: string }> {
  if (account.transport === "google-legacy") {
    return fetchGoogleLegacyEvents(account, start, end);
  }
  return fetchTsdavAccountEvents(account, start, end);
}

function dedupeEvents(items: CalendarEventItem[]): CalendarEventItem[] {
  const seen = new Set<string>();
  const out: CalendarEventItem[] = [];
  for (const item of items) {
    const key = `${item.id}|${item.startsAt}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export class CalDavCalendarAdapter implements CalendarAdapter {
  readonly id = "caldav";
  label = "CalDAV (iCloud)";

  async getUpcomingEvents(horizonDays: number): Promise<CalendarEventItem[]> {
    const cached =
      await readEditionCacheEnvelope<CalendarEventItem[]>("calendar");

    const birthdays = birthdayEventsForHorizon(
      await loadContactBirthdays(),
      horizonDays,
    );

    if (cached?.data) {
      return dedupeEvents([...cached.data, ...birthdays]).sort((a, b) =>
        a.startsAt.localeCompare(b.startsAt),
      );
    }

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
      // Keep partial successes even when one account errors.
      all.push(...result.items);
    }

    if (all.length === 0 && errors.length > 0 && labels.length === 0) {
      throw new Error(errors.join("; "));
    }

    const merged = dedupeEvents([...all, ...birthdays]).sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
    this.label =
      labels.length > 0 ? `CalDAV (${labels.join(" + ")})` : this.label;

    await writeEditionCache("calendar", merged);
    return merged;
  }
}
