import { newspaperConfig } from "@/lib/config";
import type { WeatherSnapshot } from "@/lib/types";

const WEATHER_CODE_IT: Record<number, string> = {
  0: "Sereno",
  1: "Prevalentemente sereno",
  2: "Parzialmente nuvoloso",
  3: "Coperto",
  45: "Nebbia",
  48: "Nebbia gelata",
  51: "Pioggerella leggera",
  53: "Pioggerella",
  55: "Pioggerella intensa",
  61: "Pioggia leggera",
  63: "Pioggia",
  65: "Pioggia intensa",
  71: "Neve leggera",
  73: "Neve",
  75: "Neve intensa",
  80: "Rovesci leggeri",
  81: "Rovesci",
  82: "Rovesci intensi",
  95: "Temporale",
  96: "Temporale con grandine",
  99: "Temporale forte con grandine",
};

function summarizeWeather(code: number): string {
  return WEATHER_CODE_IT[code] ?? "Condizioni variabili";
}

function mockWeather(): WeatherSnapshot {
  return {
    city: newspaperConfig.weather.city,
    country: newspaperConfig.weather.country,
    temperatureC: 18,
    feelsLikeC: 17,
    humidity: 62,
    windKmh: 12,
    weatherCode: 2,
    summary: "Parzialmente nuvoloso",
    source: "mock",
    fetchedAt: new Date().toISOString(),
  };
}

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
};

export async function getWeather(): Promise<WeatherSnapshot> {
  const { latitude, longitude, city, country } = newspaperConfig.weather;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
  );
  url.searchParams.set("timezone", newspaperConfig.timezone);
  url.searchParams.set("wind_speed_unit", "kmh");

  try {
    const response = await fetch(url.toString(), {
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const current = data.current;

    if (
      current?.temperature_2m == null ||
      current.apparent_temperature == null ||
      current.relative_humidity_2m == null ||
      current.wind_speed_10m == null ||
      current.weather_code == null
    ) {
      throw new Error("Open-Meteo response incomplete");
    }

    return {
      city,
      country,
      temperatureC: Math.round(current.temperature_2m),
      feelsLikeC: Math.round(current.apparent_temperature),
      humidity: Math.round(current.relative_humidity_2m),
      windKmh: Math.round(current.wind_speed_10m),
      weatherCode: current.weather_code,
      summary: summarizeWeather(current.weather_code),
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return mockWeather();
  }
}
