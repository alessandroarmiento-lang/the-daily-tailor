import type { NewsFeed } from "@/lib/types";
import { formatSourceLabel } from "@/lib/format";

type NewsSectionProps = {
  news: NewsFeed;
};

export function NewsSection({ news }: NewsSectionProps) {
  return (
    <section aria-labelledby="news-heading" className="min-h-0">
      <div className="mb-2 flex items-baseline justify-between border-b border-stone-900 pb-1">
        <h2 id="news-heading" className="section-kicker">
          Mondo · titoli
        </h2>
        <span className="source-pill">{formatSourceLabel(news.source)}</span>
      </div>

      <ol className="divide-y divide-stone-200">
        {news.headlines.map((item, index) => (
          <li key={item.id} className="py-1.5 first:pt-0 last:pb-0">
            <a
              href={item.url}
              target={item.url.startsWith("http") ? "_blank" : undefined}
              rel={item.url.startsWith("http") ? "noopener noreferrer" : undefined}
              className="group block"
            >
              <div className="flex gap-3">
                <span className="font-masthead w-5 shrink-0 text-base leading-none text-stone-400">
                  {index + 1}
                </span>
                <div>
                  <p className="font-serif text-[0.92rem] leading-snug font-semibold text-stone-950 group-hover:underline">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-stone-500">
                    {item.source}
                  </p>
                </div>
              </div>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
