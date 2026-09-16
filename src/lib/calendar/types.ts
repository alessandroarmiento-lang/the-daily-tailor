/**
 * Upcoming calendar events (compact widget, not a full month view).
 * Cloud VM has no Apple Calendar / EventKit: MockCalendarAdapter for v1.
 * Later: EventKit / CalDAV adapters can implement the same interface.
 */

export type CalendarEventItem = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  isAllDay: boolean;
  calendarName: string;
};

export type CalendarDayGroup = {
  /** YYYY-MM-DD in newspaper timezone */
  dateKey: string;
  label: string;
  isToday: boolean;
  events: CalendarEventItem[];
};

export type CalendarBriefing = {
  days: CalendarDayGroup[];
  fetchedAt: string;
  sourceLabel: string;
  horizonLabel: string;
  isMock: boolean;
};

export type SectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; data?: T };

export interface CalendarAdapter {
  readonly id: string;
  readonly label: string;
  /** Upcoming events for the next few days (compact widget horizon). */
  getUpcomingEvents(horizonDays: number): Promise<CalendarEventItem[]>;
}
