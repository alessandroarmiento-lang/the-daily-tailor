import { config } from "@/lib/config";
import { EventKitCalendarAdapter } from "./eventkit";
import { MockCalendarAdapter } from "./mock";
import type {
  CalendarAdapter,
  CalendarBriefing,
  CalendarDayGroup,
  CalendarEventItem,
  SectionResult,
} from "./types";

function resolveAdapter(): CalendarAdapter {
  switch (config.calendar.source) {
    case "eventkit":
      return new EventKitCalendarAdapter();
    case "mock":
    default:
      return new MockCalendarAdapter();
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

function groupByDay(
  events: CalendarEventItem[],
  horizonDays: number,
): CalendarDayGroup[] {
  const { timezone, locale } = config;
  const todayKey = dateKeyInTz(new Date().toISOString(), timezone);
  const keys: string[] = [];

  for (let i = 0; i < horizonDays; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    keys.push(dateKeyInTz(d.toISOString(), timezone));
  }

  const byKey = new Map<string, CalendarEventItem[]>();
  for (const key of keys) byKey.set(key, []);

  for (const event of events) {
    const key = dateKeyInTz(event.startsAt, timezone);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(event);
  }

  return keys.map((key) => ({
    dateKey: key,
    label: dayLabel(key, timezone, locale),
    isToday: key === todayKey,
    events: (byKey.get(key) ?? []).sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    ),
  }));
}

export async function getCalendar(): Promise<SectionResult<CalendarBriefing>> {
  const adapter = resolveAdapter();
  const horizon = config.calendar.horizonDays;
  try {
    const events = await adapter.getUpcomingEvents(horizon);
    return {
      status: "ok",
      data: {
        days: groupByDay(events, horizon),
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        horizonLabel: `Prossimi ${horizon} giorni`,
        isMock: adapter.id === "mock",
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Calendario non disponibile";
    const fallback = new MockCalendarAdapter();
    const events = await fallback.getUpcomingEvents(horizon);
    return {
      status: "error",
      message,
      data: {
        days: groupByDay(events, horizon),
        fetchedAt: new Date().toISOString(),
        sourceLabel: fallback.label,
        horizonLabel: `Prossimi ${horizon} giorni`,
        isMock: true,
      },
    };
  }
}

export type {
  CalendarAdapter,
  CalendarEventItem,
  CalendarBriefing,
} from "./types";
