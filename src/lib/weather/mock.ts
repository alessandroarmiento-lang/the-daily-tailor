import type { WeatherCondition, WeatherSnapshot } from "./types";

const LABELS: Record<WeatherCondition, string> = {
  clear: "Sereno",
  partly_cloudy: "Parzialmente nuvoloso",
  cloudy: "Nuvoloso",
  fog: "Nebbia",
  drizzle: "Pioviggine",
  rain: "Pioggia",
  snow: "Neve",
  thunderstorm: "Temporale",
  unknown: "Condizioni non disponibili",
};

/** WMO weather interpretation codes → coarse condition. */
export function conditionFromWmo(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if (code >= 95 && code <= 99) return "thunderstorm";
  return "unknown";
}

export function labelForCondition(condition: WeatherCondition): string {
  return LABELS[condition];
}

export function mockWeather(city: string, timezone: string): WeatherSnapshot {
  const now = new Date().toISOString();
  return {
    city,
    timezone,
    observedAt: now,
    temperatureC: 18,
    feelsLikeC: 17,
    humidityPercent: 62,
    windKmh: 12,
    condition: "partly_cloudy",
    conditionLabelIt: LABELS.partly_cloudy,
    highC: 22,
    lowC: 14,
    source: "mock",
    isMock: true,
  };
}
