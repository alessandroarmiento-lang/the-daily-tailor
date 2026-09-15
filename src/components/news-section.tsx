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
      <SectionError
        title="Notizie dal mondo"
        kicker="Il Post"
        message={result.message}
      />
    );
  }

  const briefing = result.data!;
  if (briefing.items.length === 0) {
    return (
      <SectionEmpty
        title="Notizie dal mondo"
        kicker="Il Post"
        message="Nessun titolo disponibile questa mattina."
      />
    );
  }

  const items = briefing.items.slice(0, config.news.maxItems);

  return (
    <SectionShell
      title="Notizie dal mondo"
      kicker="Il Post"
      tone={result.status === "error" ? "error" : "ok"}
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
      kicker="Il Post"
      message="Caricamento titoli…"
    />
  );
}
