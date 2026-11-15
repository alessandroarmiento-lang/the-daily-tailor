import { StoriaClient } from "@/app/storia/storia-client";
import { getEditionDateKey } from "@/lib/edition";
import { listEditions } from "@/lib/edition-store";

export const dynamic = "force-dynamic";

export default async function StoriaPage() {
  const [editions, todayKey] = await Promise.all([
    listEditions(),
    Promise.resolve(getEditionDateKey()),
  ]);
  return <StoriaClient initialItems={editions} initialTodayKey={todayKey} />;
}
