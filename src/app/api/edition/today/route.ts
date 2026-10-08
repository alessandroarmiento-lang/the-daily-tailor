import { getOrBuildTodayEdition } from "@/lib/build-edition";
import {
  getNextEditionRollover,
  resolveEditionAsOf,
} from "@/lib/edition";

export const dynamic = "force-dynamic";

/**
 * Today's edition JSON (build+persist if missing).
 * `?asOf=civil` — wall-clock day (AGGIORNA after midnight before 06:00).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const dateKey = resolveEditionAsOf(url.searchParams.get("asOf"));
  const { edition, created } = await getOrBuildTodayEdition({ dateKey });
  return Response.json({
    edition,
    created,
    editionDateKey: dateKey,
    nextRolloverAt: getNextEditionRollover().toISOString(),
  });
}
