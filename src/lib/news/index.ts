import { config } from "@/lib/config";
import { mockNews } from "./mock";
import type { NewsBriefing, NewsItem, SectionResult } from "./types";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function tagContent(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : null;
}

function parseRssItems(xml: string, maxItems: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = itemRe.exec(xml)) !== null && items.length < maxItems) {
    const block = match[0];
    const title = tagContent(block, "title");
    if (!title) continue;

    const link = tagContent(block, "link") ?? "#";
    const description = tagContent(block, "description");
    const pubDate = tagContent(block, "pubDate");
    const source =
      tagContent(block, "source") ??
      tagContent(block, "dc:creator") ??
      "World news";

    items.push({
      id: `rss-${index++}-${title.slice(0, 24)}`,
      title,
      summary: description
        ? description.replace(/<[^>]+>/g, "").slice(0, 180)
        : null,
      source,
      url: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }

  return items;
}

function feedLabelFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("bbc")) return "BBC World";
    if (host.includes("ansa")) return "ANSA";
    return host;
  } catch {
    return "Feed RSS";
  }
}

async function fetchRssNews(): Promise<NewsBriefing> {
  const res = await fetch(config.news.feedUrl, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    next: { revalidate: 900 },
  });

  if (!res.ok) {
    throw new Error(`RSS HTTP ${res.status}`);
  }

  const xml = await res.text();
  const items = parseRssItems(xml, config.news.maxItems);
  if (items.length === 0) {
    throw new Error("RSS: nessun titolo trovato");
  }

  return {
    items,
    feedLabel: feedLabelFromUrl(config.news.feedUrl),
    fetchedAt: new Date().toISOString(),
    isMock: false,
  };
}

export async function getWorldNews(): Promise<SectionResult<NewsBriefing>> {
  try {
    const data = await fetchRssNews();
    return { status: "ok", data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Notizie non disponibili";
    return {
      status: "error",
      message,
      data: mockNews(),
    };
  }
}
