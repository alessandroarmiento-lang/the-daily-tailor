import { config } from "@/lib/config";
import { getEditionDateKey } from "@/lib/edition";
import {
  buildDaytimePrecipHours,
  conditionFromWmo,
  emptyPrecipitation,
  labelForCondition,
  sumDaytimeAmountMm,
} from "./mock";
import type {
  PrecipitationForecast,
  WeatherProvider,
  WeatherSnapshot,
} from "./types";

type OpenMeteoResponse = {
  timezone?: string;
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m?: number;
    weather_code: number;
    wind_speed_10m?: number;
    apparent_temperature?: number;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
  };
};

function buildPrecipitation(
  json: OpenMeteoResponse,
  timezone: string,
): PrecipitationForecast {
  const dayKey = getEditionDateKey(new Date(), timezone);
  const dailyTimes = json.daily?.time ?? [];
  let dayIndex = dailyTimes.findIndex((t) => t.slice(0, 10) === dayKey);
  if (dayIndex < 0) dayIndex = 0;

  const todayChance =
    json.daily?.precipitation_probability_max?.[dayIndex] != null
      ? Math.round(json.daily.precipitation_probability_max[dayIndex]!)
      : null;
  const dailySum =
    json.daily?.precipitation_sum?.[dayIndex] != null
      ? Math.round(json.daily.precipitation_sum[dayIndex]! * 10) / 10
      : null;

  const times = json.hourly?.time ?? [];
  const chances = json.hourly?.precipitation_probability ?? [];
  const amounts = json.hourly?.precipitation ?? [];
  const samples = times.map((iso, i) => ({
    iso,
    chancePercent: chances[i] != null ? Math.round(Number(chances[i])) : 0,
    amountMm:
      amounts[i] != null ? Math.round(Number(amounts[i]) * 10) / 10 : null,
  }));

  const nextHours = buildDaytimePrecipHours(samples, timezone, dayKey);
  // Daily precipitation_sum for “Oggi previsti X mm”; hourly strip keeps %.
  const todayAmount = dailySum ?? sumDaytimeAmountMm(nextHours);

  return {
    todayChancePercent: todayChance,
    todayAmountMm: todayAmount,
    nextHours,
  };
}

export const openMeteoProvider: WeatherProvider = {
  id: "open-meteo",
  labelIt: "Open-Meteo (provvisorio)",
  isConfigured() {
    return true;
  },
  async fetch(): Promise<WeatherSnapshot> {
    const { latitude, longitude, city } = config.weather;
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature",
      hourly: "precipitation_probability,precipitation",
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
      timezone: config.timezone,
      // Two civil days so 07–22 of the edition day is always covered.
      forecast_days: "2",
    });

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      { next: { revalidate: 600 } },
    );

    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }

    const json = (await res.json()) as OpenMeteoResponse;
    if (!json.current) {
      throw new Error("Open-Meteo: missing current weather");
    }

    const timezone = json.timezone ?? config.timezone;
    const condition = conditionFromWmo(json.current.weather_code);
    const precipitation = buildPrecipitation(json, timezone);
    const dayKey = getEditionDateKey(new Date(), timezone);
    const dailyTimes = json.daily?.time ?? [];
    let dayIndex = dailyTimes.findIndex((t) => t.slice(0, 10) === dayKey);
    if (dayIndex < 0) dayIndex = 0;

    return {
      city,
      timezone,
      observedAt: json.current.time,
      temperatureC: Math.round(json.current.temperature_2m),
      feelsLikeC:
        json.current.apparent_temperature != null
          ? Math.round(json.current.apparent_temperature)
          : null,
      humidityPercent: json.current.relative_humidity_2m ?? null,
      windKmh:
        json.current.wind_speed_10m != null
          ? Math.round(json.current.wind_speed_10m)
          : null,
      condition,
      conditionLabelIt: labelForCondition(condition),
      highC:
        json.daily?.temperature_2m_max?.[dayIndex] != null
          ? Math.round(json.daily.temperature_2m_max[dayIndex]!)
          : null,
      lowC:
        json.daily?.temperature_2m_min?.[dayIndex] != null
          ? Math.round(json.daily.temperature_2m_min[dayIndex]!)
          : null,
      precipitation:
        precipitation.nextHours.length > 0 ||
        precipitation.todayAmountMm != null
          ? precipitation
          : emptyPrecipitation(),
      source: "open-meteo",
      isMock: false,
    };
  },
};
