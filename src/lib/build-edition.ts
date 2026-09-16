import { getAphorismForDateKey } from "@/lib/aphorism";
import { getActionEmails } from "@/lib/action-emails";
import { getCalendar } from "@/lib/calendar";
import { config } from "@/lib/config";
import { getEditionDateKey } from "@/lib/edition";
import type { NewspaperEdition } from "@/lib/edition-types";
import { loadEdition, saveEdition } from "@/lib/edition-store";
import { getWorldNews } from "@/lib/news";
import { preserveNewsUrls } from "@/lib/news-links";
import { getReminders } from "@/lib/reminders";
import { sanitizeEditionReminders } from "@/lib/sanitize-edition-reminders";
import { getWeather } from "@/lib/weather";

function formatEditionDateLine(dateKey: string, timeZone: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Noon UTC avoids DST edge flips for civil formatting.
  const instant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(config.locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(instant);
}

/** Build a full morning edition snapshot for a date key (default: today). */
export async function buildEdition(
  dateKey: string = getEditionDateKey(),
): Promise<NewspaperEdition> {
  const [weather, news, reminders, calendar, actionEmails] = await Promise.all([
    getWeather(),
    getWorldNews(),
    getReminders(),
    getCalendar(),
    getActionEmails(),
  ]);

  const edition: NewspaperEdition = {
    schemaVersion: 1,
    dateKey,
    generatedAt: new Date().toISOString(),
    timezone: config.timezone,
    productName: config.productName,
    tagline: config.tagline,
    dateLine: formatEditionDateLine(dateKey, config.timezone),
    aphorism: getAphorismForDateKey(dateKey),
    weather,
    // Article URLs stay in the JSON so offline headlines remain Il Post links.
    news: preserveNewsUrls(news),
    reminders,
    calendar,
    actionEmails,
  };

  return edition;
}

/**
 * Return today's persisted edition, building + saving if missing.
 * Pass `force: true` to regenerate (morning-warm / launchd).
 */
export async function getOrBuildTodayEdition(options?: {
  force?: boolean;
}): Promise<{ edition: NewspaperEdition; created: boolean; path?: string }> {
  const dateKey = getEditionDateKey();
  if (!options?.force) {
    const existing = await loadEdition(dateKey);
    if (existing) {
      const { edition: cleaned } = sanitizeEditionReminders(existing);
      return {
        edition: {
          ...cleaned,
          news: preserveNewsUrls(cleaned.news),
        },
        created: false,
      };
    }
  }
  const edition = await buildEdition(dateKey);
  const { edition: cleaned } = sanitizeEditionReminders(edition);
  const path = await saveEdition(cleaned);
  return { edition: cleaned, created: true, path };
}
