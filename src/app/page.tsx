import { Suspense } from "react";
import {
  ActionEmailsSection,
  ActionEmailsSectionFallback,
} from "@/components/action-emails-section";
import { AphorismSection } from "@/components/aphorism-section";
import {
  CalendarSection,
  CalendarSectionFallback,
} from "@/components/calendar-section";
import { Masthead } from "@/components/masthead";
import {
  NewsSection,
  NewsSectionFallback,
} from "@/components/news-section";
import { PrintToolbar } from "@/components/print-toolbar";
import {
  RemindersSection,
  RemindersSectionFallback,
} from "@/components/reminders-section";
import {
  WeatherSection,
  WeatherSectionFallback,
} from "@/components/weather-section";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <PrintToolbar />
      <main className="sheet-page">
        <Masthead />
        <AphorismSection />
        <div className="sheet-grid">
          <div className="area-weather">
            <Suspense fallback={<WeatherSectionFallback />}>
              <WeatherSection />
            </Suspense>
          </div>
          <div className="area-calendar">
            <Suspense fallback={<CalendarSectionFallback />}>
              <CalendarSection />
            </Suspense>
          </div>
          <div className="area-news">
            <Suspense fallback={<NewsSectionFallback />}>
              <NewsSection />
            </Suspense>
          </div>
          <div className="area-reminders">
            <Suspense fallback={<RemindersSectionFallback />}>
              <RemindersSection />
            </Suspense>
          </div>
          <div className="area-emails">
            <Suspense fallback={<ActionEmailsSectionFallback />}>
              <ActionEmailsSection />
            </Suspense>
          </div>
        </div>
        <footer className="sheet-footer">
          <span>{config.productName}</span>
          <span>Web · iPhone · stampa A4</span>
        </footer>
      </main>
    </>
  );
}
