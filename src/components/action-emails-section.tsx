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

  if (result.status === "error" && !result.data) {
    return (
      <SectionError title="Email da fare" message={result.message} />
    );
  }

  const briefing = result.data!;
  if (briefing.items.length === 0) {
    return (
      <SectionEmpty
        title="Email da fare"
        message="Nessuna email d’azione arrivata ieri."
      />
    );
  }

  const items = briefing.items.slice(0, config.actionEmails.maxItems);

  return (
    <SectionShell
      title="Email da fare"
      kicker="Ieri · richieste d’azione"
      tone={result.status === "error" ? "error" : "ok"}
    >
      <ul className="action-mail-list">
        {items.map((item) => (
          <li key={item.id} className="action-mail-list__item">
            <p className="action-mail-list__subject">{item.subject}</p>
            <p className="action-mail-list__from">
              {item.senderName}
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
    <SectionEmpty title="Email da fare" message="Caricamento email…" />
  );
}
