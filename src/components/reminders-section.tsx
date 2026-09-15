import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import { config } from "@/lib/config";
import { getReminders } from "@/lib/reminders";

function formatDue(iso: string | null): string {
  if (!iso) return "Senza scadenza";
  return new Intl.DateTimeFormat(config.locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.timezone,
  }).format(new Date(iso));
}

function priorityLabel(priority: string): string | null {
  switch (priority) {
    case "high":
      return "Alta";
    case "medium":
      return "Media";
    case "low":
      return "Bassa";
    default:
      return null;
  }
}

export async function RemindersSection() {
  const result = await getReminders();

  if (result.status === "error" && !result.data) {
    return <SectionError title="Promemoria" message={result.message} />;
  }

  const briefing = result.data!;
  if (briefing.items.length === 0) {
    return (
      <SectionEmpty
        title="Promemoria"
        message="Nessun reminder aperto per oggi."
      />
    );
  }

  const items = briefing.items.slice(0, config.reminders.maxItems);

  return (
    <SectionShell
      title="Promemoria"
      kicker="Oggi / aperti"
      tone={result.status === "error" ? "error" : "ok"}
    >
      <ul className="reminder-list">
        {items.map((item) => {
          const pri = priorityLabel(item.priority);
          return (
            <li key={item.id} className="reminder-list__item">
              <span className="reminder-list__box" aria-hidden="true" />
              <div>
                <p className="reminder-list__title">{item.title}</p>
                <p className="reminder-list__meta">
                  {item.listName}
                  {" · "}
                  {formatDue(item.dueAt)}
                  {pri ? ` · Priorità ${pri}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

export function RemindersSectionFallback() {
  return (
    <SectionEmpty title="Promemoria" message="Caricamento promemoria…" />
  );
}
