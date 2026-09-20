/**
 * iCloud Contacts via CardDAV — headless, works with Mac off.
 * Used to match senders for actionable email and to surface birthdays
 * (Contacts BDAY are not exposed on iCloud CalDAV).
 */
import { createDAVClient } from "tsdav";
import { config } from "@/lib/config";
import type { CalendarEventItem } from "@/lib/calendar/types";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function hasIcloudCardDavCredentials(): boolean {
  return Boolean(
    (env("ICLOUD_CARDDAV_USER") ||
      env("ICLOUD_MAIL_USER") ||
      env("ICLOUD_CALDAV_USER")) &&
      (env("ICLOUD_CARDDAV_APP_PASSWORD") ||
        env("ICLOUD_MAIL_APP_PASSWORD") ||
        env("ICLOUD_CALDAV_APP_PASSWORD")),
  );
}

function cardDavAuth(): { username: string; password: string } | null {
  const username =
    env("ICLOUD_CARDDAV_USER") ||
    env("ICLOUD_MAIL_USER") ||
    env("ICLOUD_CALDAV_USER");
  const password =
    env("ICLOUD_CARDDAV_APP_PASSWORD") ||
    env("ICLOUD_MAIL_APP_PASSWORD") ||
    env("ICLOUD_CALDAV_APP_PASSWORD");
  if (!username || !password) return null;
  return { username, password };
}

/** Extract EMAIL lines from a vCard body. */
function emailsFromVcard(text: string): string[] {
  const out: string[] = [];
  const re = /^EMAIL[^:]*:(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const addr = m[1].trim().toLowerCase();
    if (addr.includes("@")) out.push(addr);
  }
  return out;
}

function unfoldVcard(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function fieldValue(text: string, name: string): string | null {
  const re = new RegExp(`^${name}[^:]*:(.+)$`, "im");
  const m = unfoldVcard(text).match(re);
  if (!m) return null;
  return m[1].trim();
}

/** FN or N (Family;Given;...) → display name. */
function nameFromVcard(text: string): string | null {
  const fn = fieldValue(text, "FN");
  if (fn) return fn.replace(/\\,/g, ",").replace(/\\;/g, ";").trim() || null;
  const n = fieldValue(text, "N");
  if (!n) return null;
  const parts = n.split(";").map((p) => p.replace(/\\,/g, ",").trim());
  const family = parts[0] || "";
  const given = parts[1] || "";
  const joined = [given, family].filter(Boolean).join(" ").trim();
  return joined || null;
}

/**
 * Parse BDAY: supports YYYY-MM-DD, YYYYMMDD, --MMDD (no year).
 * Returns month/day (1-based) or null.
 */
function bdayFromVcard(text: string): { month: number; day: number } | null {
  const raw = fieldValue(text, "BDAY");
  if (!raw) return null;
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { month: Number(m[2]), day: Number(m[3]) };
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return { month: Number(m[2]), day: Number(m[3]) };
  m = s.match(/^--(\d{2})-?(\d{2})/);
  if (m) return { month: Number(m[1]), day: Number(m[2]) };
  return null;
}

function dateKeyInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addCivilDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12));
  return utc.toISOString().slice(0, 10);
}

function zonedDayStartIso(dateKey: string, timeZone: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const inTz = new Date(probe.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = asUtc.getTime() - inTz.getTime();
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMs).toISOString();
}

export type ContactBirthday = {
  name: string;
  month: number;
  day: number;
};

/**
 * Load contact email addresses from iCloud CardDAV.
 * Returns empty set (not throw) when credentials missing — filter still works
 * without Contacts match.
 */
export async function loadContactEmails(): Promise<Set<string>> {
  const auth = cardDavAuth();
  if (!auth) return new Set();

  try {
    const client = await createDAVClient({
      serverUrl: "https://contacts.icloud.com",
      credentials: auth,
      authMethod: "Basic",
      defaultAccountType: "carddav",
    });

    const addressBooks = await client.fetchAddressBooks();
    const emails = new Set<string>();

    for (const book of addressBooks) {
      const objects = await client.fetchVCards({ addressBook: book });
      for (const obj of objects) {
        const data = typeof obj.data === "string" ? obj.data : "";
        for (const e of emailsFromVcard(data)) emails.add(e);
      }
    }
    return emails;
  } catch {
    // Contacts enricher is best-effort; never block the edition.
    return new Set();
  }
}

/** Load contacts that have a BDAY (best-effort). */
export async function loadContactBirthdays(): Promise<ContactBirthday[]> {
  const auth = cardDavAuth();
  if (!auth) return [];

  try {
    const client = await createDAVClient({
      serverUrl: "https://contacts.icloud.com",
      credentials: auth,
      authMethod: "Basic",
      defaultAccountType: "carddav",
    });

    const addressBooks = await client.fetchAddressBooks();
    const out: ContactBirthday[] = [];

    for (const book of addressBooks) {
      const objects = await client.fetchVCards({ addressBook: book });
      for (const obj of objects) {
        const data = typeof obj.data === "string" ? obj.data : "";
        if (!data) continue;
        const bday = bdayFromVcard(data);
        const name = nameFromVcard(data);
        if (!bday || !name) continue;
        if (bday.month < 1 || bday.month > 12 || bday.day < 1 || bday.day > 31) {
          continue;
        }
        out.push({ name, month: bday.month, day: bday.day });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Turn contact birthdays into all-day agenda events for the horizon window.
 */
export function birthdayEventsForHorizon(
  birthdays: ContactBirthday[],
  horizonDays: number,
): CalendarEventItem[] {
  if (birthdays.length === 0 || horizonDays <= 0) return [];
  const tz = config.timezone;
  const todayKey = dateKeyInTz(new Date(), tz);
  const items: CalendarEventItem[] = [];

  for (let i = 0; i < horizonDays; i += 1) {
    const key = addCivilDays(todayKey, i);
    const [, mm, dd] = key.split("-").map(Number);
    for (const b of birthdays) {
      if (b.month !== mm || b.day !== dd) continue;
      const title = `Compleanno ${b.name}`;
      items.push({
        id: `bday|${b.name}|${key}`,
        title,
        location: null,
        startsAt: zonedDayStartIso(key, tz),
        endsAt: zonedDayStartIso(addCivilDays(key, 1), tz),
        isAllDay: true,
        calendarName: "Compleanni",
      });
    }
  }
  return items;
}
