import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import { reminderDeepLink } from "@/lib/apple/deep-links";
import { config } from "@/lib/config";
import { getReminders } from "@/lib/reminders";
import { remindersOverflowLabel } from "@/lib/section-overflow";

function formatDue(iso: string | null): string {
  if (!iso) return "Senza scadenza";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "Senza scadenza";
  const now = new Date();
  const sameDay =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(due) ===
    new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  if (sameDay) {
    return new Intl.DateTimeFormat(config.locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: config.timezone,
    }).format(due);
  }
  return new Intl.DateTimeFormat(config.locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.timezone,
  }).format(due);
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

  if (result.status === "error" && (!result.data || result.data.items.length === 0)) {
    return (
      <SectionError
        title="Promemoria"
        message={
          result.message ||
          "Autorizza Promemoria o configura CalDAV iCloud per generare a Mac spento."
        }
      />
    );
  }

  const briefing = result.data!;
  if (briefing.items.length === 0) {
    return (
      <SectionEmpty
        title="Promemoria"
        message={
          briefing.sourceLabel.includes("CloudKit")
            ? "Promemoria Apple non leggibili via CalDAV (CloudKit). Su Mac usa EventKit."
            : "Nessun reminder aperto."
        }
      />
    );
  }

  const items = briefing.items.slice(0, config.reminders.maxItems);
  const hidden =
    typeof briefing.hiddenCount === "number" ? briefing.hiddenCount : 0;
  const overflow = remindersOverflowLabel(hidden);

  return (
    <SectionShell
      title="Promemoria"
      kicker="Oggi / aperti"
      tone={result.status === "error" ? "error" : "ok"}
      footerNote={
        result.status === "error" ? result.message : undefined
      }
    >
      <ul className="reminder-list">
        {items.map((item) => {
          const pri = priorityLabel(item.priority);
          const href = reminderDeepLink(item.id);
          const title = href ? (
            <a className="reminder-list__link" href={href}>
              {item.title}
            </a>
          ) : (
            item.title
          );
          return (
            <li key={item.id} className="reminder-list__item">
              <span className="reminder-list__box" aria-hidden="true" />
              <div>
                <p className="reminder-list__title">{title}</p>
                <p className="reminder-list__meta">
                  <span className="reminder-list__list">{item.listName}</span>
                  {" · "}
                  {formatDue(item.dueAt)}
                  {pri ? ` · Priorità ${pri}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {overflow ? (
        <p className="section-overflow">{overflow}</p>
      ) : null}
    </SectionShell>
  );
}

export function RemindersSectionFallback() {
  return (
    <SectionEmpty title="Promemoria" message="Caricamento promemoria…" />
  );
}
