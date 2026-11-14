import { getAphorismForDateKey } from "@/lib/aphorism";
import { getActionEmails } from "@/lib/action-emails";
import type { ActionEmailBriefing } from "@/lib/action-emails/types";
import { getCalendar } from "@/lib/calendar";
import { config } from "@/lib/config";
import { getEditionDateKey } from "@/lib/edition";
import type { NewspaperEdition } from "@/lib/edition-types";
import { listEditions, loadEdition, saveEdition } from "@/lib/edition-store";
import { getHealth } from "@/lib/health";
import { getWorldNews } from "@/lib/news";
import { preserveNewsUrls } from "@/lib/news-links";
import { getReminders } from "@/lib/reminders";
import { sanitizeEditionReminders } from "@/lib/sanitize-edition-reminders";
import type { SectionResult } from "@/lib/weather/types";
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

/**
 * If this build found no attention mail, keep the last non-empty mail block
 * from a previous edition so the band is never blank.
 */
async function carryForwardEmails(
  dateKey: string,
  current: SectionResult<ActionEmailBriefing>,
): Promise<SectionResult<ActionEmailBriefing>> {
  const fresh = current.data?.items ?? [];
  if (current.status === "ok" && fresh.length > 0) return current;

  const listed = await listEditions();
  const older = listed
    .map((item) => item.dateKey)
    .filter((key) => key < dateKey)
    .sort()
    .reverse()
    .slice(0, 21);

  for (const key of older) {
    const prev = await loadEdition(key);
    const items = prev?.actionEmails?.data?.items ?? [];
    if (!prev?.actionEmails.data || items.length === 0) continue;
    return {
      status: "ok",
      data: {
        ...prev.actionEmails.data,
        items,
        windowLabel: "Ultime pubblicate",
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  return current;
}

/** Build a full morning edition snapshot for a date key (default: today). */
export async function buildEdition(
  dateKey: string = getEditionDateKey(),
): Promise<NewspaperEdition> {
  const [weather, news, reminders, calendar, actionEmails, health] =
    await Promise.all([
    getWeather(undefined, { dateKey }),
    getWorldNews(),
    getReminders(dateKey),
    getCalendar(dateKey),
    getActionEmails(dateKey),
    getHealth(dateKey),
  ]);
  const emails = await carryForwardEmails(dateKey, actionEmails);

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
    actionEmails: emails,
    health,
  };

  return edition;
}

type BuiltToday = {
  edition: NewspaperEdition;
  created: boolean;
  path?: string;
};

/** Coalesce concurrent force rebuilds per date key (AGGIORNA used to stack IMAP). */
const forceBuildInflight = new Map<string, Promise<BuiltToday>>();

/**
 * Return a persisted edition for `dateKey`, building + saving if missing.
 * Pass `force: true` to regenerate (morning-warm / AGGIORNA / launchd).
 */
export async function getOrBuildTodayEdition(options?: {
  force?: boolean;
  /** Override edition rollover (e.g. civil wall-clock day for AGGIORNA). */
  dateKey?: string;
}): Promise<BuiltToday> {
  const dateKey = options?.dateKey ?? getEditionDateKey();

  // AGGIORNA kicks morning-warm (force) then fetches /api/edition/today.
  // If a force rebuild is already in flight for this day, wait for it —
  // otherwise the non-force path would return the stale file on disk.
  const existingInflight = forceBuildInflight.get(dateKey);
  if (existingInflight) {
    return existingInflight;
  }

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
    const edition = await buildEdition(dateKey);
    const { edition: cleaned } = sanitizeEditionReminders(edition);
    const path = await saveEdition(cleaned);
    return { edition: cleaned, created: true, path };
  }

  const inflight = (async () => {
    const edition = await buildEdition(dateKey);
    const { edition: cleaned } = sanitizeEditionReminders(edition);
    const path = await saveEdition(cleaned);
    return { edition: cleaned, created: true, path };
  })().finally(() => {
    forceBuildInflight.delete(dateKey);
  });

  forceBuildInflight.set(dateKey, inflight);
  return inflight;
}
