import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import { getWeather } from "@/lib/weather";
import { formatOggiPrecipMm } from "@/lib/weather/mock";
import type { PrecipitationForecast } from "@/lib/weather/types";

function providerLabel(source: string): string {
  switch (source) {
    case "weatherkit":
      return "Apple Weather";
    case "open-meteo":
      return "Open-Meteo";
    case "openweathermap":
      return "OpenWeatherMap";
    case "mock":
      return "Mock";
    default:
      return source;
  }
}

/** Six hours per row so iPhone (~390px) can read labels; print stays compact. */
const PRECIP_ROW_SIZE = 6;

function PrecipitationBlock({ precip }: { precip: PrecipitationForecast }) {
  const hasToday = precip.todayAmountMm != null;
  const hours = precip.nextHours;
  if (!hasToday && hours.length === 0) return null;

  const rows: (typeof hours)[] = [];
  for (let i = 0; i < hours.length; i += PRECIP_ROW_SIZE) {
    rows.push(hours.slice(i, i + PRECIP_ROW_SIZE));
  }

  return (
    <div className="weather__precip">
      <p className="weather__precip-title">Precipitazioni</p>
      {hasToday ? (
        <p className="weather__precip-today">
          {formatOggiPrecipMm(precip.todayAmountMm!)}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="weather__precip-rows" aria-label="Previsione oraria">
          {rows.map((row, rowIndex) => (
            <div
              key={`precip-row-${row[0]?.hourLabel ?? rowIndex}`}
              className="weather__precip-chart"
            >
              {row.map((h) => (
                <div
                  key={`${h.hourLabel}-${h.chancePercent}`}
                  className="weather__precip-col"
                >
                  <div className="weather__precip-bar-wrap">
                    <div
                      className="weather__precip-bar"
                      style={{ height: `${Math.max(4, h.chancePercent)}%` }}
                      title={`${h.hourLabel}h: ${h.chancePercent}%`}
                    />
                  </div>
                  {/* Plain text labels (not absolute units) so a missed CSS
                      load still reads as “h07” / “0%”, not “h07%0”. */}
                  <div className="weather__precip-hour">{`h${h.hourLabel}`}</div>
                  <div className="weather__precip-pct">{`${h.chancePercent}%`}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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
  noteParts.push(weather.isMock ? "Mock" : providerLabel(weather.source));

  return (
    <SectionShell
      title="Meteo di oggi"
      kicker={weather.city}
      tone={result.status === "error" ? "error" : "ok"}
      footerNote={noteParts.join(" · ")}
    >
      <div className="weather">
        <div className="weather__top">
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
        <PrecipitationBlock precip={weather.precipitation} />
      </div>
    </SectionShell>
  );
}

export function WeatherSectionFallback() {
  return (
    <SectionEmpty title="Meteo di oggi" message="Caricamento meteo…" />
  );
}
