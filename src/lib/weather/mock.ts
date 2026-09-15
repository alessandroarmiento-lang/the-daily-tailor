import type {
  PrecipitationForecast,
  WeatherCondition,
  WeatherSnapshot,
} from "./types";

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

/** Apple WeatherKit conditionCode → coarse condition. */
export function conditionFromWeatherKit(code: string): WeatherCondition {
  const c = code.toLowerCase();
  if (
    c.includes("thunder") ||
    c.includes("severe") ||
    c.includes("tornado") ||
    c.includes("hurricane")
  ) {
    return "thunderstorm";
  }
  if (c.includes("snow") || c.includes("blizzard") || c.includes("flurries")) {
    return "snow";
  }
  if (c.includes("drizzle") || c.includes("sprinkle")) return "drizzle";
  if (
    c.includes("rain") ||
    c.includes("shower") ||
    c.includes("sleet") ||
    c.includes("wintry")
  ) {
    return "rain";
  }
  if (c.includes("fog") || c.includes("haze") || c.includes("smoke")) {
    return "fog";
  }
  if (c.includes("cloud") || c.includes("overcast")) {
    return c.includes("partly") || c.includes("mostlyclear")
      ? "partly_cloudy"
      : "cloudy";
  }
  if (c.includes("clear") || c.includes("sun") || c.includes("hot")) {
    return "clear";
  }
  return "unknown";
}

export function labelForCondition(condition: WeatherCondition): string {
  return LABELS[condition];
}

export function emptyPrecipitation(): PrecipitationForecast {
  return {
    todayChancePercent: null,
    todayAmountMm: null,
    nextHours: [],
  };
}

export function mockPrecipitation(): PrecipitationForecast {
  return {
    todayChancePercent: 35,
    todayAmountMm: 1.2,
    nextHours: [
      { hourLabel: "09", chancePercent: 10, amountMm: 0 },
      { hourLabel: "10", chancePercent: 20, amountMm: 0 },
      { hourLabel: "11", chancePercent: 35, amountMm: 0.1 },
      { hourLabel: "12", chancePercent: 45, amountMm: 0.3 },
      { hourLabel: "13", chancePercent: 40, amountMm: 0.2 },
      { hourLabel: "14", chancePercent: 25, amountMm: 0 },
    ],
  };
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
    precipitation: mockPrecipitation(),
    source: "mock",
    isMock: true,
  };
}

/** Format an ISO timestamp to a 2-digit local hour in the given IANA zone. */
export function hourLabelInZone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      hour12: false,
      timeZone,
    }).format(new Date(iso));
  } catch {
    const d = new Date(iso);
    return String(d.getHours()).padStart(2, "0");
  }
}
