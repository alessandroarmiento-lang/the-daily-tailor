import { listEditions } from "@/lib/edition-store";
import { getEditionDateKey } from "@/lib/edition";

export const dynamic = "force-dynamic";

/** List persisted morning editions (newest first) for history UI. */
export async function GET() {
  const editions = await listEditions();
  return Response.json({
    editions,
    todayKey: getEditionDateKey(),
  });
}
