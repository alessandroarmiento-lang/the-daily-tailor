import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import { getWeather } from "@/lib/weather";

export async function WeatherSection() {
  const result = await getWeather();

  if (result.status === "error" && !result.data) {
    return (
      <SectionError title="Meteo di oggi" message={result.message} />
    );
  }

  const weather = result.data!;
  const noteParts: string[] = [];
  if (result.status === "error") {
    noteParts.push(`Dati di riserva: ${result.message}`);
  }
  if (weather.isMock) {
    noteParts.push("Sorgente mock");
  } else {
    noteParts.push(`Sorgente: ${weather.source}`);
  }

  return (
    <SectionShell
      title="Meteo di oggi"
      kicker={weather.city}
      tone={result.status === "error" ? "error" : "ok"}
      footerNote={noteParts.join(" · ")}
    >
      <div className="weather">
        <p className="weather__temp">
          <span className="weather__deg">{weather.temperatureC}°</span>
          <span className="weather__unit">C</span>
        </p>
        <div className="weather__meta">
          <p className="weather__condition">{weather.conditionLabelIt}</p>
          <ul className="weather__facts">
            {weather.feelsLikeC != null ? (
              <li>Percepiti {weather.feelsLikeC}°</li>
            ) : null}
            {weather.highC != null && weather.lowC != null ? (
              <li>
                Max {weather.highC}° / Min {weather.lowC}°
              </li>
            ) : null}
            {weather.humidityPercent != null ? (
              <li>Umidità {weather.humidityPercent}%</li>
            ) : null}
            {weather.windKmh != null ? (
              <li>Vento {weather.windKmh} km/h</li>
            ) : null}
          </ul>
        </div>
      </div>
    </SectionShell>
  );
}

export function WeatherSectionFallback() {
  return (
    <SectionEmpty title="Meteo di oggi" message="Caricamento meteo…" />
  );
}
