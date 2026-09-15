import { config } from "@/lib/config";
import {
  conditionFromWmo,
  emptyPrecipitation,
  hourLabelInZone,
  labelForCondition,
} from "./mock";
import type {
  PrecipHour,
  PrecipitationForecast,
  WeatherProvider,
  WeatherSnapshot,
} from "./types";

const HOURLY_SLOTS = 6;

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
  const todayChance =
    json.daily?.precipitation_probability_max?.[0] != null
      ? Math.round(json.daily.precipitation_probability_max[0])
      : null;
  const todayAmount =
    json.daily?.precipitation_sum?.[0] != null
      ? Math.round(json.daily.precipitation_sum[0] * 10) / 10
      : null;

  const times = json.hourly?.time ?? [];
  const chances = json.hourly?.precipitation_probability ?? [];
  const amounts = json.hourly?.precipitation ?? [];
  const now = Date.now();
  const nextHours: PrecipHour[] = [];

  for (let i = 0; i < times.length && nextHours.length < HOURLY_SLOTS; i++) {
    const t = Date.parse(times[i]!);
    if (Number.isNaN(t) || t < now - 30 * 60 * 1000) continue;
    const chance = chances[i];
    nextHours.push({
      hourLabel: hourLabelInZone(times[i]!, timezone),
      chancePercent: chance != null ? Math.round(chance) : 0,
      amountMm:
        amounts[i] != null ? Math.round(Number(amounts[i]) * 10) / 10 : null,
    });
  }

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
      forecast_days: "1",
      forecast_hours: "24",
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
        json.daily?.temperature_2m_max?.[0] != null
          ? Math.round(json.daily.temperature_2m_max[0])
          : null,
      lowC:
        json.daily?.temperature_2m_min?.[0] != null
          ? Math.round(json.daily.temperature_2m_min[0])
          : null,
      precipitation:
        precipitation.nextHours.length > 0 ||
        precipitation.todayChancePercent != null
          ? precipitation
          : emptyPrecipitation(),
      source: "open-meteo",
      isMock: false,
    };
  },
};
