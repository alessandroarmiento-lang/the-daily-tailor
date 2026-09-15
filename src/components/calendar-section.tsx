import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import { getCalendar } from "@/lib/calendar";
import { config } from "@/lib/config";

function formatEventTime(iso: string, isAllDay: boolean): string {
  if (isAllDay) return "Tutto il giorno";
  return new Intl.DateTimeFormat(config.locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.timezone,
  }).format(new Date(iso));
}

export async function CalendarSection() {
  const result = await getCalendar();

  if (result.status === "error" && !result.data) {
    return <SectionError title="Agenda" message={result.message} />;
  }

  const briefing = result.data!;
  const days = briefing.days.map((day) => ({
    ...day,
    events: day.events.slice(0, config.calendar.maxEventsPerDay),
  }));
  const hasAny = days.some((day) => day.events.length > 0);
  if (!hasAny) {
    return (
      <SectionEmpty
        title="Agenda"
        message="Nessun evento nei prossimi giorni."
      />
    );
  }

  const noteParts = [briefing.horizonLabel, briefing.sourceLabel];
  if (briefing.isMock) {
    noteParts.push("Mock — Apple Calendar / EventKit");
  }
  if (result.status === "error") {
    noteParts.push(result.message);
  }

  return (
    <SectionShell
      title="Agenda"
      kicker="Prossimi giorni"
      tone={result.status === "error" ? "error" : "ok"}
      footerNote={noteParts.join(" · ")}
    >
      <div className="cal-widget" role="list">
        {days.map((day) => (
          <div
            key={day.dateKey}
            className={`cal-day${day.isToday ? " cal-day--today" : ""}`}
            role="listitem"
          >
            <p className="cal-day__label">
              {day.isToday ? "Oggi · " : ""}
              {day.label}
            </p>
            {day.events.length === 0 ? (
              <p className="cal-day__empty">—</p>
            ) : (
              <ul className="cal-day__events">
                {day.events.map((event) => (
                  <li key={event.id} className="cal-event">
                    <span className="cal-event__time">
                      {formatEventTime(event.startsAt, event.isAllDay)}
                    </span>
                    <span className="cal-event__title">{event.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

export function CalendarSectionFallback() {
  return <SectionEmpty title="Agenda" message="Caricamento agenda…" />;
}
