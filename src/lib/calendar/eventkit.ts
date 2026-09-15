/**
 * Apple Calendar via AppleScript (Calendar.app / EventKit).
 */
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import { runOsascriptJson } from "@/lib/apple/run-osascript";
import type { CalendarAdapter, CalendarEventItem } from "./types";

type ScriptResult = {
  ok: boolean;
  error?: string;
  items?: Array<{
    id: string;
    title: string;
    location: string | null;
    startsAt: string;
    endsAt: string;
    isAllDay: boolean;
    calendarName: string;
  }>;
};

export class EventKitCalendarAdapter implements CalendarAdapter {
  readonly id = "eventkit";
  readonly label = "Apple Calendar";

  async getUpcomingEvents(horizonDays: number): Promise<CalendarEventItem[]> {
    const cached =
      await readEditionCacheEnvelope<CalendarEventItem[]>("calendar");
    if (cached?.data) {
      return cached.data;
    }

    const result = await runOsascriptJson<ScriptResult>(
      "fetch-calendar.applescript",
      [String(horizonDays)],
      60_000,
    );

    if (!result.ok) {
      throw new Error(result.error ?? "Calendar: fetch fallito");
    }

    const items: CalendarEventItem[] = (result.items ?? []).map((e) => ({
      id: e.id || `cal-${e.startsAt}-${e.title}`,
      title: e.title,
      location: e.location,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      isAllDay: Boolean(e.isAllDay),
      calendarName: e.calendarName || "Calendar",
    }));

    await writeEditionCache("calendar", items);
    return items;
  }
}
