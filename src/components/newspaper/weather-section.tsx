import type { WeatherSnapshot } from "@/lib/types";
import { formatSourceLabel } from "@/lib/format";

type WeatherSectionProps = {
  weather: WeatherSnapshot;
};

export function WeatherSection({ weather }: WeatherSectionProps) {
  return (
    <section aria-labelledby="weather-heading">
      <div className="mb-2 flex items-baseline justify-between border-b border-stone-900 pb-1">
        <h2 id="weather-heading" className="section-kicker">
          Meteo di oggi
        </h2>
        <span className="source-pill">{formatSourceLabel(weather.source)}</span>
      </div>

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-3">
        <div>
          <p className="font-masthead text-5xl leading-none font-semibold tracking-tight text-stone-950">
            {weather.temperatureC}°
          </p>
          <p className="mt-2 font-serif text-lg leading-snug text-stone-800">
            {weather.summary}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {weather.city}, {weather.country}
          </p>
        </div>

        <dl className="space-y-1.5 border-l border-stone-300 pl-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-stone-500">Percepita</dt>
            <dd className="font-medium text-stone-900">{weather.feelsLikeC}°</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-stone-500">Umidità</dt>
            <dd className="font-medium text-stone-900">{weather.humidity}%</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-stone-500">Vento</dt>
            <dd className="font-medium text-stone-900">{weather.windKmh} km/h</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
