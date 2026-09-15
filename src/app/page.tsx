import { Masthead } from "@/components/newspaper/masthead";
import { NewsSection } from "@/components/newspaper/news-section";
import { PrintToolbar } from "@/components/newspaper/print-toolbar";
import { RemindersSection } from "@/components/newspaper/reminders-section";
import { WeatherSection } from "@/components/newspaper/weather-section";
import { getWorldNews } from "@/lib/news";
import { getEmailReminders } from "@/lib/reminders";
import { getWeather } from "@/lib/weather";

export default async function HomePage() {
  const generatedAt = new Date();
  const [weather, news, reminders] = await Promise.all([
    getWeather(),
    getWorldNews(),
    getEmailReminders(),
  ]);

  return (
    <div className="newspaper-shell min-h-full bg-[#f4efe6]">
      <PrintToolbar />

      <article className="newspaper-page mx-auto mb-10 w-full max-w-[210mm] bg-[#fbf8f1] px-6 py-6 text-stone-950 shadow-[0_18px_50px_rgba(40,30,10,0.12)] sm:px-8 sm:py-7 print:mb-0 print:max-w-none print:shadow-none">
        <Masthead generatedAt={generatedAt} />

        <div className="mt-5 grid gap-5 md:grid-cols-[0.95fr_1.35fr] md:gap-6">
          <div className="space-y-5">
            <WeatherSection weather={weather} />
            <RemindersSection reminders={reminders} />
          </div>
          <NewsSection news={news} />
        </div>

        <footer className="mt-5 border-t border-stone-900 pt-2 text-[10px] uppercase tracking-[0.14em] text-stone-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Stampare su A4 · una facciata</span>
            <span>
              Meteo {weather.source === "live" ? "Open-Meteo" : "esempio"} · News{" "}
              {news.source === "live" ? "BBC World RSS" : "esempio"} · Email esempio
            </span>
          </div>
        </footer>
      </article>
    </div>
  );
}
