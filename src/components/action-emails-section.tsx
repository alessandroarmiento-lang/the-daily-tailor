import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import { getActionEmails } from "@/lib/action-emails";
import { config } from "@/lib/config";

function formatReceived(iso: string): string {
  return new Intl.DateTimeFormat(config.locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.timezone,
  }).format(new Date(iso));
}

export async function ActionEmailsSection() {
  const result = await getActionEmails();

  if (result.status === "error" && (!result.data || result.data.items.length === 0)) {
    return (
      <SectionError
        title="Email"
        message={
          result.message ||
          "Autorizza Mail o configura IMAP (iCloud + Gmail) per generare a Mac spento."
        }
      />
    );
  }

  const briefing = result.data!;
  if (briefing.items.length === 0) {
    return (
      <SectionEmpty
        title="Email"
        message="Nessuna email d’azione arrivata ieri."
      />
    );
  }

  const items = briefing.items.slice(0, config.actionEmails.maxItems);

  return (
    <SectionShell
      title="Email"
      kicker="Ieri · richieste d’azione"
      tone={result.status === "error" ? "error" : "ok"}
      footerNote={
        result.status === "error" ? result.message : briefing.sourceLabel
      }
    >
      <ul className="action-mail-list">
        {items.map((item) => (
          <li key={item.id} className="action-mail-list__item">
            <p className="action-mail-list__subject">
              {item.messageUrl ? (
                <a href={item.messageUrl} className="action-mail-list__link">
                  {item.subject}
                </a>
              ) : (
                item.subject
              )}
            </p>
            <p className="action-mail-list__from">
              {item.senderName}
              {item.account ? ` · ${item.account}` : ""}
              <span className="action-mail-list__when">
                {" · "}
                {formatReceived(item.receivedAt)}
              </span>
            </p>
            <p className="action-mail-list__cue">{item.actionCue}</p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

export function ActionEmailsSectionFallback() {
  return (
    <SectionEmpty title="Email" message="Caricamento email…" />
  );
}
