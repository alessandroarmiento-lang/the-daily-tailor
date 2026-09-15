/**
 * Placeholder for a future Apple Calendar / EventKit integration.
 * Not used on this cloud VM — documents the swap contract only.
 */
import type { CalendarAdapter, CalendarEventItem } from "./types";

export class EventKitCalendarAdapter implements CalendarAdapter {
  readonly id = "eventkit";
  readonly label = "Apple Calendar (EventKit)";

  async getUpcomingEvents(_horizonDays: number): Promise<CalendarEventItem[]> {
    throw new Error(
      "EventKitCalendarAdapter requires a Mac host with Calendar access. Use MockCalendarAdapter on cloud/CI.",
    );
  }
}
