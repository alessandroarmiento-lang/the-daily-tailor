import { DailyPaperApp } from "@/components/daily-paper-app";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <ServiceWorkerRegister />
      <DailyPaperApp dateKey="today" timezone={config.timezone} />
    </>
  );
}
