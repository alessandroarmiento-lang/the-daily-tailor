import { config } from "@/lib/config";

function formatEditionDate(date: Date): string {
  return new Intl.DateTimeFormat(config.locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: config.timezone,
  }).format(date);
}

export function Masthead() {
  const now = new Date();
  const dateLine = formatEditionDate(now);

  return (
    <header className="masthead">
      <p className="masthead__edition">Edizione personale · {dateLine}</p>
      <h1 className="masthead__brand">{config.productName}</h1>
      <p className="masthead__tagline">
        Briefing del mattino — meteo, agenda, mondo, Reminders, email
      </p>
      <div className="masthead__rule" aria-hidden="true" />
    </header>
  );
}
