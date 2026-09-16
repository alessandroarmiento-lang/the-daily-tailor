import type { CalendarAdapter, CalendarEventItem } from "./types";

function atDayOffset(
  dayOffset: number,
  hours: number,
  minutes: number,
): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function allDay(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const MOCK_EVENTS: CalendarEventItem[] = [
  {
    id: "cal-1",
    title: "Stand-up prodotto",
    location: "Meet",
    startsAt: atDayOffset(0, 9, 30),
    endsAt: atDayOffset(0, 9, 45),
    isAllDay: false,
    calendarName: "Lavoro",
  },
  {
    id: "cal-2",
    title: "Pranzo con Luca",
    location: "Trastevere",
    startsAt: atDayOffset(0, 13, 0),
    endsAt: atDayOffset(0, 14, 30),
    isAllDay: false,
    calendarName: "Personale",
  },
  {
    id: "cal-3",
    title: "Scadenza bozza The Daily Tailor",
    location: null,
    startsAt: allDay(1),
    endsAt: null,
    isAllDay: true,
    calendarName: "Lavoro",
  },
  {
    id: "cal-4",
    title: "Visita medica",
    location: "Studio Conti",
    startsAt: atDayOffset(1, 16, 0),
    endsAt: atDayOffset(1, 16, 45),
    isAllDay: false,
    calendarName: "Personale",
  },
  {
    id: "cal-5",
    title: "Call fornitori",
    location: "Zoom",
    startsAt: atDayOffset(2, 10, 0),
    endsAt: atDayOffset(2, 11, 0),
    isAllDay: false,
    calendarName: "Lavoro",
  },
  {
    id: "cal-6",
    title: "Cena famiglia",
    location: null,
    startsAt: atDayOffset(3, 20, 0),
    endsAt: atDayOffset(3, 22, 0),
    isAllDay: false,
    calendarName: "Famiglia",
  },
];

export class MockCalendarAdapter implements CalendarAdapter {
  readonly id = "mock";
  readonly label = "Calendar (mock)";

  async getUpcomingEvents(horizonDays: number): Promise<CalendarEventItem[]> {
    const now = new Date();
    const end = new Date();
    end.setDate(end.getDate() + horizonDays);
    end.setHours(23, 59, 59, 999);

    return MOCK_EVENTS.filter((event) => {
      const start = new Date(event.startsAt);
      return start >= new Date(now.toDateString()) && start <= end;
    });
  }
}
