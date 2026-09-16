import { DailyPaperApp } from "@/components/daily-paper-app";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { config } from "@/lib/config";
import { getEditionDateKey } from "@/lib/edition";
import { loadEdition } from "@/lib/edition-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Disk-only SSR: never call getOrBuild here (Mail/osascript can hang).
  const initialEdition = await loadEdition(getEditionDateKey());

  return (
    <>
      <ServiceWorkerRegister />
      <DailyPaperApp
        dateKey="today"
        timezone={config.timezone}
        initialEdition={initialEdition}
      />
    </>
  );
}
