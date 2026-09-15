import { DailyPaperApp } from "@/components/daily-paper-app";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { config } from "@/lib/config";
import { isValidDateKey } from "@/lib/edition";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ date: string }>;
};

export default async function EditionByDatePage({ params }: PageProps) {
  const { date } = await params;
  if (!isValidDateKey(date)) notFound();

  return (
    <>
      <ServiceWorkerRegister />
      <DailyPaperApp
        dateKey={date}
        timezone={config.timezone}
        showHistoryLink
      />
    </>
  );
}
