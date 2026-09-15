import type { NewsBriefing, NewsItem, SectionResult } from "@/lib/news/types";

/** Keep only absolute http(s) article URLs (Il Post links in the morning sheet). */
export function normalizeArticleUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "#") return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Snapshot news items must always carry `url` for offline headline links. */
export function preserveNewsUrls(
  news: SectionResult<NewsBriefing>,
): SectionResult<NewsBriefing> {
  if (!news.data) return news;
  const items: NewsItem[] = news.data.items.map((item) => {
    const url = normalizeArticleUrl(item.url) ?? item.url;
    return { ...item, url };
  });
  return {
    ...news,
    data: {
      ...news.data,
      items,
    },
  };
}
