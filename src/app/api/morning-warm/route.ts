import { revalidateTag } from "next/cache";
import { clearEditionAdapterCache } from "@/lib/apple/edition-cache";
import { getOrBuildTodayEdition } from "@/lib/build-edition";
import {
  DAILY_TAILOR_CACHE_TAG,
  editionCacheTag,
  getEditionDateKey,
  getNextEditionRollover,
} from "@/lib/edition";

export const dynamic = "force-dynamic";

/**
 * Generate / refresh the morning edition snapshot and warm section caches.
 * Intended for launchd at 06:00 Europe/Rome (and manual curls).
 *
 * Does not push to the iPhone — Safari cannot receive silent background
 * downloads. The phone pulls when opened (or via Shortcuts notification).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") !== "0";

  const editionDateKey = getEditionDateKey();
  const nextRollover = getNextEditionRollover();

  // Next 16 requires a cacheLife profile as the second argument.
  revalidateTag(DAILY_TAILOR_CACHE_TAG, "max");
  revalidateTag(editionCacheTag(editionDateKey), "max");
  revalidateTag("section-weather", "max");
  revalidateTag("section-news", "max");

  if (force) {
    await clearEditionAdapterCache(editionDateKey);
  }

  const { edition, created, path: savedPath } = await getOrBuildTodayEdition({
    force,
  });

  return Response.json({
    ok: true,
    editionDateKey,
    created,
    path: savedPath ?? null,
    nextRolloverAt: nextRollover.toISOString(),
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
    newsFeed: edition.news.data?.feedLabel ?? null,
    actionEmailSource: edition.actionEmails.data?.sourceLabel ?? null,
    warmedAt: new Date().toISOString(),
  });
}
