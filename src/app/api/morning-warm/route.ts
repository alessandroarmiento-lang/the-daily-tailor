import { revalidateTag } from "next/cache";
import { clearEditionAdapterCache } from "@/lib/apple/edition-cache";
import { getOrBuildTodayEdition } from "@/lib/build-edition";
import {
  DAILY_TAILOR_CACHE_TAG,
  editionCacheTag,
  getNextEditionRollover,
  resolveEditionAsOf,
} from "@/lib/edition";
import { notifyEditionReady } from "@/lib/push/send";
import { withBudget } from "@/lib/with-budget";

export const dynamic = "force-dynamic";

/** Cap so a hung IMAP/CalDAV adapter cannot hold Fly / AGGIORNA forever. */
const BUILD_BUDGET_MS = 90_000;

/**
 * Generate / refresh the morning edition snapshot and warm section caches.
 * Intended for launchd at 06:00 Europe/Rome (and manual curls).
 *
 * `?asOf=civil` — AGGIORNA: build the wall-clock civil day even before the
 * 06:00 edition rollover; the 06:00 cron warms again without this flag.
 *
 * After a successful warm, sends a visible Web Push to subscribed Home Screen
 * PWAs. The service worker then fetches today's JSON into Cache API + IndexedDB
 * so the first open of the day works offline (phone needs network at push time).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") !== "0";
  const editionDateKey = resolveEditionAsOf(url.searchParams.get("asOf"));
  const nextRollover = getNextEditionRollover();

  // Next 16 requires a cacheLife profile as the second argument.
  revalidateTag(DAILY_TAILOR_CACHE_TAG, "max");
  revalidateTag(editionCacheTag(editionDateKey), "max");
  revalidateTag("section-weather", "max");
  revalidateTag("section-news", "max");

  if (force) {
    await clearEditionAdapterCache(editionDateKey);
  }

  try {
    const { edition, created, path: savedPath } = await withBudget(
      getOrBuildTodayEdition({ force, dateKey: editionDateKey }),
      BUILD_BUDGET_MS,
      "morning-warm",
    );

    const push = await notifyEditionReady({
      dateKey: edition.dateKey,
      productName: edition.productName,
    });

    return Response.json({
      ok: true,
      editionDateKey,
      created,
      path: savedPath ?? null,
      nextRolloverAt: nextRollover.toISOString(),
      push,
      sections: {
        weather: edition.weather.status,
        news: edition.news.status,
        reminders: edition.reminders.status,
        calendar: edition.calendar.status,
        actionEmails: edition.actionEmails.status,
        aphorism: edition.aphorism.dateKey,
      },
      weatherSource:
        edition.weather.data && !edition.weather.data.isMock
          ? edition.weather.data.source
          : "mock",
      weatherCity: edition.weather.data?.city ?? null,
      newsFeed: edition.news.data?.feedLabel ?? null,
      actionEmailSource: edition.actionEmails.data?.sourceLabel ?? null,
      warmedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        ok: false,
        editionDateKey,
        nextRolloverAt: nextRollover.toISOString(),
        error: message,
      },
      { status: 504 },
    );
  }
}
