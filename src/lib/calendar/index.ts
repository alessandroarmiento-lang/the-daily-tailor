import { config } from "@/lib/config";
import { calendarAuthMessage } from "@/lib/apple/permissions";
import { getEditionDateKey } from "@/lib/edition";
import { CalDavCalendarAdapter } from "./caldav";
import { EventKitCalendarAdapter } from "./eventkit";
import { MockCalendarAdapter } from "./mock";
import { isPushedCalendarFresh, loadPushedCalendar } from "./pushed";
import type {
  CalendarAdapter,
  CalendarBriefing,
  CalendarDayGroup,
  CalendarEventItem,
  SectionResult,
} from "./types";

function resolveAdapter(): CalendarAdapter {
  const source = config.calendar.source;
  const onDarwin = process.platform === "darwin";

  // Linux / Fly: never EventKit — always CalDAV for Mac-off.
  if (!onDarwin && source !== "mock") {
    return new CalDavCalendarAdapter();
  }

  switch (source) {
    case "caldav":
      return new CalDavCalendarAdapter();
    case "eventkit":
      return new EventKitCalendarAdapter();
    case "mock":
      return new MockCalendarAdapter();
    case "auto":
    default: {
      // Mac awake: EventKit covers all subscribed calendars (iCloud + Google).
      // CalDAV iCloud-only missed events like Gmail "Raccolta alimentare".
      if (onDarwin) return new EventKitCalendarAdapter();
      return new CalDavCalendarAdapter();
    }
  }
}

function dateKeyInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** All-day events keep the civil day written by Calendar.app. */
function eventDateKey(event: CalendarEventItem, timeZone: string): string {
  if (event.isAllDay) {
    const leading = /^(\d{4}-\d{2}-\d{2})/.exec(event.startsAt.trim());
    if (leading) return leading[1];
  }
  return dateKeyInTz(event.startsAt, timeZone);
}

function isBirthdayCalendar(name: string): boolean {
  return /compleann|birthday/i.test(name);
}

function isHolidayCalendar(name: string): boolean {
  return /festiv|holiday/i.test(name);
}

function isObservance(event: CalendarEventItem): boolean {
  return isBirthdayCalendar(event.calendarName) || isHolidayCalendar(event.calendarName);
}

function foldObservanceTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bdi gesu\b/g, "")
    .replace(/\bconcezione\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Apple shows both the Italian subscription and Google holidays. Same day, one line. */
function dedupeObservances(
  events: CalendarEventItem[],
  timeZone: string,
): CalendarEventItem[] {
  const rest: CalendarEventItem[] = [];
  const best = new Map<string, CalendarEventItem>();
  for (const event of events) {
    if (!isObservance(event)) {
      rest.push(event);
      continue;
    }
    const key = `${eventDateKey(event, timeZone)}|${foldObservanceTitle(event.title)}`;
    const prev = best.get(key);
    const preferIncoming =
      !prev ||
      (isHolidayCalendar(event.calendarName) &&
        event.calendarName.toLowerCase().includes("italiane") &&
        !prev.calendarName.toLowerCase().includes("italiane"));
    if (preferIncoming) best.set(key, event);
  }
  return [...rest, ...best.values()];
}

function dayLabel(dateKey: string, timeZone: string, locale: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
}

function addCivilDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12));
  return utc.toISOString().slice(0, 10);
}

/** How far past the short horizon birthdays and holidays still appear. */
const OBSERVANCE_LOOKAHEAD_DAYS = 45;

function groupByDay(
  events: CalendarEventItem[],
  _horizonDays: number,
  editionDateKey: string,
): CalendarDayGroup[] {
  const { timezone, locale } = config;
  const todayKey = editionDateKey;
  const tomorrowKey = addCivilDays(editionDateKey, 1);
  const lookaheadEnd = addCivilDays(editionDateKey, OBSERVANCE_LOOKAHEAD_DAYS);
  const visible = dedupeObservances(events, timezone);

  // Today and tomorrow when they have events. Then later birthdays and
  // holidays, oldest first, until the locked day count. Empty days omitted.
  const byKey = new Map<string, CalendarEventItem[]>();
  const later: CalendarEventItem[] = [];
  for (const event of visible) {
    const key = eventDateKey(event, timezone);
    if (key < editionDateKey) continue;
    if (key === editionDateKey || key === tomorrowKey) {
      const bucket = byKey.get(key) ?? [];
      bucket.push(event);
      byKey.set(key, bucket);
      continue;
    }
    if (key <= lookaheadEnd && isObservance(event)) later.push(event);
  }

  for (const event of later) {
    const key = eventDateKey(event, timezone);
    const bucket = byKey.get(key) ?? [];
    bucket.push(event);
    byKey.set(key, bucket);
  }

  const dayCount = config.calendar.dayCount;
  return [...byKey.keys()].sort().slice(0, dayCount).map((key) => ({
    dateKey: key,
    label: dayLabel(key, timezone, locale),
    isToday: key === todayKey,
    events: (byKey.get(key) ?? []).sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    ),
  }));
}

export async function getCalendar(
  dateKey: string = getEditionDateKey(),
): Promise<SectionResult<CalendarBriefing>> {
  const adapter = resolveAdapter();
  const horizon = config.calendar.horizonDays;
  const useMock = adapter.id === "mock";

  // Fly has no EventKit. A fresh Mac push is the Apple Calendar, including
  // scheduled reminders. On the Mac, EventKit itself is the source.
  if (process.platform !== "darwin") {
    const pushed = await loadPushedCalendar();
    if (pushed && isPushedCalendarFresh(pushed) && pushed.events.length > 0) {
      return {
        status: "ok",
        data: {
          days: groupByDay(pushed.events, horizon, dateKey),
          fetchedAt: pushed.receivedAt,
          sourceLabel: `${pushed.deviceLabel} (Calendario)`,
          horizonLabel: `Prossimi ${horizon} giorni`,
          isMock: false,
        },
      };
    }
  }

  try {
    const events = await adapter.getUpcomingEvents(horizon, dateKey);
    return {
      status: "ok",
      data: {
        days: groupByDay(events, horizon, dateKey),
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        horizonLabel: `Prossimi ${horizon} giorni`,
        isMock: useMock,
      },
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Calendario non disponibile";
    const message =
      useMock || adapter.id === "caldav" ? raw : calendarAuthMessage(raw);

    return {
      status: "error",
      message,
      data: {
        days: groupByDay([], horizon, dateKey),
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        horizonLabel: `Prossimi ${horizon} giorni`,
        isMock: useMock,
      },
    };
  }
}

export type {
  CalendarAdapter,
  CalendarEventItem,
  CalendarBriefing,
} from "./types";
