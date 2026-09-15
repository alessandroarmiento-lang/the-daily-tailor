import { newspaperConfig } from "@/lib/config";
import type { NewsFeed, NewsHeadline } from "@/lib/types";

const BBC_WORLD_RSS = "https://feeds.bbci.co.uk/news/world/rss.xml";

function mockNews(): NewsFeed {
  const now = new Date().toISOString();
  return {
    source: "mock",
    fetchedAt: now,
    headlines: [
      {
        id: "mock-1",
        title: "Le capitali europee coordinano la risposta alle tensioni commerciali",
        source: "Esempio",
        publishedAt: now,
        url: "#",
      },
      {
        id: "mock-2",
        title: "Nuovo accordo climatico: obiettivi più stringenti per il 2035",
        source: "Esempio",
        publishedAt: now,
        url: "#",
      },
      {
        id: "mock-3",
        title: "Mercati asiatici in rialzo dopo i dati sull’occupazione",
        source: "Esempio",
        publishedAt: now,
        url: "#",
      },
      {
        id: "mock-4",
        title: "Scienziati annunciano progressi su un vaccino universale antinfluenzale",
        source: "Esempio",
        publishedAt: now,
        url: "#",
      },
      {
        id: "mock-5",
        title: "Missione spaziale internazionale completa il rientro con successo",
        source: "Esempio",
        publishedAt: now,
        url: "#",
      },
      {
        id: "mock-6",
        title: "Città costiere sperimentano barriere naturali contro l’erosione",
        source: "Esempio",
        publishedAt: now,
        url: "#",
      },
      {
        id: "mock-7",
        title: "Vertice ONU: focus su sicurezza alimentare e corridoi umanitari",
        source: "Esempio",
        publishedAt: now,
        url: "#",
      },
      {
        id: "mock-8",
        title: "Innovazione nei trasporti: linee ferroviarie notturne tornano in Europa",
        source: "Esempio",
        publishedAt: now,
        url: "#",
      },
    ],
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

function parseRssItems(xml: string): NewsHeadline[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);

  return items.slice(0, newspaperConfig.newsLimit).map((item, index) => {
    const title = extractTag(item, "title") ?? `Titolo ${index + 1}`;
    const link = extractTag(item, "link") ?? "#";
    const pubDate = extractTag(item, "pubDate");
    const sourceName = extractTag(item, "source") ?? "BBC World";

    return {
      id: `bbc-${index}-${title.slice(0, 24)}`,
      title,
      source: sourceName,
      publishedAt: pubDate,
      url: link,
    };
  });
}

export async function getWorldNews(): Promise<NewsFeed> {
  try {
    const response = await fetch(BBC_WORLD_RSS, {
      next: { revalidate: 1800 },
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`RSS HTTP ${response.status}`);
    }

    const xml = await response.text();
    const headlines = parseRssItems(xml);

    if (headlines.length === 0) {
      throw new Error("RSS contained no items");
    }

    return {
      headlines,
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return mockNews();
  }
}
