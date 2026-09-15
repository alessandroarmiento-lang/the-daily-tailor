import { config } from "@/lib/config";
import { conditionFromWmo, labelForCondition, mockWeather } from "./mock";
import type { SectionResult, WeatherSnapshot } from "./types";

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
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

async function fetchOpenMeteo(): Promise<WeatherSnapshot> {
  const { latitude, longitude, city } = config.weather;
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: config.timezone,
    forecast_days: "1",
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

  const condition = conditionFromWmo(json.current.weather_code);

  return {
    city,
    timezone: json.timezone ?? config.timezone,
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
    source: "open-meteo",
    isMock: false,
  };
}

/**
 * Prefer Open-Meteo (no key). If it fails, return mock with error status
 * so the sheet still prints.
 */
export async function getWeather(): Promise<SectionResult<WeatherSnapshot>> {
  try {
    const data = await fetchOpenMeteo();
    return { status: "ok", data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Meteo non disponibile";
    return {
      status: "error",
      message,
      data: mockWeather(config.weather.city, config.timezone),
    };
  }
}
