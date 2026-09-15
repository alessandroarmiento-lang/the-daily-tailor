/**
 * Apple Calendar via EventKit Swift CLI (preferred) or AppleScript fallback.
 * Node-spawned osascript often lacks Automation TCC; EventKit uses Calendars privacy.
 */
import { config } from "@/lib/config";
import {
  readEditionCacheEnvelope,
  writeEditionCache,
} from "@/lib/apple/edition-cache";
import {
  runEventKitBinJson,
  runOsascriptJson,
} from "@/lib/apple/run-osascript";
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

function mapItems(raw: NonNullable<ScriptResult["items"]>): CalendarEventItem[] {
  return raw.map((e) => ({
    id: e.id || `cal-${e.startsAt}-${e.title}`,
    title: e.title,
    location: e.location,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    isAllDay: Boolean(e.isAllDay),
    calendarName: e.calendarName || "Calendar",
  }));
}

export class EventKitCalendarAdapter implements CalendarAdapter {
  readonly id = "eventkit";
  label = "Apple Calendar";

  async getUpcomingEvents(horizonDays: number): Promise<CalendarEventItem[]> {
    const cached =
      await readEditionCacheEnvelope<CalendarEventItem[]>("calendar");
    if (cached?.data) {
      return cached.data;
    }

    let result: ScriptResult;
    try {
      result = await runEventKitBinJson<ScriptResult>(
        "fetch-calendar-eventkit",
        [String(horizonDays)],
        45_000,
      );
      this.label = "Apple Calendar (EventKit)";
    } catch (binErr) {
      try {
        result = await runOsascriptJson<ScriptResult>(
          "fetch-calendar.applescript",
          [String(horizonDays)],
          45_000,
        );
        this.label = "Apple Calendar (AppleScript)";
      } catch {
        const binMsg =
          binErr instanceof Error ? binErr.message : String(binErr);
        throw new Error(
          `Calendario non disponibile. Compila EventKit tool (scripts/macos/build-eventkit-tools.sh) e autorizza Privacy → Calendari. Dettaglio: ${binMsg.slice(0, 180)}`,
        );
      }
    }

    if (!result.ok) {
      throw new Error(result.error ?? "Calendar: fetch fallito");
    }

    const items = mapItems(result.items ?? []);
    await writeEditionCache("calendar", items);
    return items;
  }
}
