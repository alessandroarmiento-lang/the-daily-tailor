import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import { config } from "@/lib/config";
import { getWorldNews } from "@/lib/news";

export async function NewsSection() {
  const result = await getWorldNews();

  if (result.status === "error" && !result.data) {
    return (
      <SectionError title="Notizie dal mondo" message={result.message} />
    );
  }

  const briefing = result.data!;
  if (briefing.items.length === 0) {
    return (
      <SectionEmpty
        title="Notizie dal mondo"
        message="Nessun titolo disponibile questa mattina."
      />
    );
  }

  const items = briefing.items.slice(0, config.news.maxItems);
  const hidden = Math.max(0, briefing.items.length - items.length);
  const noteParts: string[] = [briefing.feedLabel];
  if (hidden > 0) noteParts.push(`+${hidden} omessi (limite 1 pagina)`);
  if (result.status === "error") {
    noteParts.push(`Fallback: ${result.message}`);
  }
  if (briefing.isMock) {
    noteParts.push("Sorgente mock");
  }

  return (
    <SectionShell
      title="Notizie dal mondo"
      kicker="Il Post"
      tone={result.status === "error" ? "error" : "ok"}
      footerNote={noteParts.join(" · ")}
    >
      <ol className="headline-list">
        {items.map((item, i) => (
          <li key={item.id} className="headline-list__item">
            <span className="headline-list__index">{i + 1}.</span>
            <div>
              <a
                className="headline-list__title"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.title}
              </a>
              {item.summary ? (
                <p className="headline-list__summary">{item.summary}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}

export function NewsSectionFallback() {
  return (
    <SectionEmpty
      title="Notizie dal mondo"
      message="Caricamento titoli…"
    />
  );
}
