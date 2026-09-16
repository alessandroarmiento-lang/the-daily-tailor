import { getOrBuildTodayEdition } from "@/lib/build-edition";
import { getEditionDateKey, getNextEditionRollover } from "@/lib/edition";

export const dynamic = "force-dynamic";

/** Today's morning edition JSON (build+persist if missing). */
export async function GET() {
  const { edition, created } = await getOrBuildTodayEdition();
  return Response.json({
    edition,
    created,
    editionDateKey: getEditionDateKey(),
    nextRolloverAt: getNextEditionRollover().toISOString(),
  });
}
