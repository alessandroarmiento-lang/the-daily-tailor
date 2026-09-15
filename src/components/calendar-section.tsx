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

/** Compact calendar source hint (Birthdays / holidays / etc.). */
function calendarHint(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("compleann") || n.includes("birthday")) return "Compleanni";
  if (n.includes("festiv") || n.includes("holiday")) return "Festività";
  return null;
}

export async function CalendarSection() {
  const result = await getCalendar();

  if (result.status === "error") {
    const hasAny = result.data?.days.some((d) => d.events.length > 0);
    if (!hasAny) {
      return (
        <SectionError
          title="Agenda"
          kicker="Prossimi giorni"
          message={
            result.message ||
            "Autorizza Calendario o configura CalDAV iCloud per generare a Mac spento."
          }
        />
      );
    }
  }

  const briefing = result.data!;
  const maxPerDay = config.calendar.maxEventsPerDay;
  const days = briefing.days.map((day) => {
    const hidden = Math.max(0, day.events.length - maxPerDay);
    return {
      ...day,
      events: day.events.slice(0, maxPerDay),
      hidden,
    };
  });
  const hasAny = days.some((day) => day.events.length > 0);
  if (!hasAny) {
    return (
      <SectionEmpty
        title="Agenda"
        kicker="Prossimi giorni"
        message="Nessun evento nei prossimi giorni."
      />
    );
  }

  return (
    <SectionShell
      title="Agenda"
      kicker="Prossimi giorni"
      tone={result.status === "error" ? "error" : "ok"}
      footerNote={
        result.status === "error" ? result.message : briefing.sourceLabel
      }
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
                {day.events.map((event) => {
                  const hint = calendarHint(event.calendarName);
                  return (
                    <li key={event.id} className="cal-event">
                      <span className="cal-event__time">
                        {formatEventTime(event.startsAt, event.isAllDay)}
                      </span>
                      <span className="cal-event__title">
                        {event.title}
                        {hint ? (
                          <span className="cal-event__cal"> · {hint}</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
                {day.hidden > 0 ? (
                  <li className="cal-event cal-event--more">
                    +{day.hidden} altri
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

export function CalendarSectionFallback() {
  return (
    <SectionEmpty
      title="Agenda"
      kicker="Prossimi giorni"
      message="Caricamento agenda…"
    />
  );
}
