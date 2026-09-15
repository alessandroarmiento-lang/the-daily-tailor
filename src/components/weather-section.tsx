import {
  SectionEmpty,
  SectionError,
  SectionShell,
} from "@/components/section-shell";
import { getWeather } from "@/lib/weather";
import type { PrecipitationForecast } from "@/lib/weather/types";

function PrecipitationBlock({ precip }: { precip: PrecipitationForecast }) {
  const hasToday = precip.todayChancePercent != null;
  const hours = precip.nextHours;
  if (!hasToday && hours.length === 0) return null;

  return (
    <div className="weather__precip">
      <p className="weather__precip-title">Precipitazioni</p>
      {hasToday ? (
        <p className="weather__precip-today">
          Oggi {precip.todayChancePercent}%
          {precip.todayAmountMm != null && precip.todayAmountMm > 0
            ? ` · ${precip.todayAmountMm} mm`
            : ""}
        </p>
      ) : null}
      {hours.length > 0 ? (
        <div className="weather__precip-chart" aria-label="Previsione oraria">
          {hours.map((h) => (
            <div key={`${h.hourLabel}-${h.chancePercent}`} className="weather__precip-col">
              <div className="weather__precip-bar-wrap">
                <div
                  className="weather__precip-bar"
                  style={{ height: `${Math.max(4, h.chancePercent)}%` }}
                  title={`${h.hourLabel}: ${h.chancePercent}%`}
                />
              </div>
              <span className="weather__precip-hour">{h.hourLabel}</span>
              <span className="weather__precip-pct">{h.chancePercent}</span>
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

  return (
    <SectionShell
      title="Meteo di oggi"
      kicker={weather.city}
      tone={result.status === "error" ? "error" : "ok"}
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
