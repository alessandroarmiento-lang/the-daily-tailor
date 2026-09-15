import type {
  PrecipitationForecast,
  PrecipHour,
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

/**
 * Daytime precip strip: 07:00–22:00 local (inclusive).
 * No overnight hours; full day band for the morning sheet.
 */
export const PRECIP_TIMELINE_START_HOUR = 7;
export const PRECIP_TIMELINE_END_HOUR = 22;

export function mockPrecipitation(): PrecipitationForecast {
  const nextHours: PrecipHour[] = [];
  for (let h = PRECIP_TIMELINE_START_HOUR; h <= PRECIP_TIMELINE_END_HOUR; h++) {
    const chance = Math.max(0, Math.min(80, (h - 7) * 5));
    nextHours.push({
      hourLabel: String(h).padStart(2, "0"),
      chancePercent: chance,
      amountMm: chance > 40 ? 0.2 : 0,
    });
  }
  return {
    todayChancePercent: 35,
    todayAmountMm: 1.2,
    nextHours,
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

/** Local hour-of-day (0–23) in the given IANA zone. */
export function hourOfDayInZone(iso: string, timeZone: string): number {
  const label = hourLabelInZone(iso, timeZone);
  const n = Number.parseInt(label, 10);
  return Number.isFinite(n) ? n : new Date(iso).getHours();
}

export function isPrecipTimelineHour(iso: string, timeZone: string): boolean {
  const h = hourOfDayInZone(iso, timeZone);
  return h >= PRECIP_TIMELINE_START_HOUR && h <= PRECIP_TIMELINE_END_HOUR;
}

/** Civil YYYY-MM-DD in an IANA zone. */
export function dateKeyInZone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

type PrecipSample = {
  iso: string;
  chancePercent: number;
  amountMm: number | null;
};

/**
 * Build a fixed 07–22 strip for one civil day. Missing hours → 0%.
 */
export function buildDaytimePrecipHours(
  samples: PrecipSample[],
  timeZone: string,
  dayKey: string,
): PrecipHour[] {
  const byHour = new Map<number, PrecipHour>();
  for (const sample of samples) {
    if (dateKeyInZone(sample.iso, timeZone) !== dayKey) continue;
    const h = hourOfDayInZone(sample.iso, timeZone);
    if (h < PRECIP_TIMELINE_START_HOUR || h > PRECIP_TIMELINE_END_HOUR) {
      continue;
    }
    byHour.set(h, {
      hourLabel: String(h).padStart(2, "0"),
      chancePercent: sample.chancePercent,
      amountMm: sample.amountMm,
    });
  }

  const nextHours: PrecipHour[] = [];
  for (let h = PRECIP_TIMELINE_START_HOUR; h <= PRECIP_TIMELINE_END_HOUR; h++) {
    nextHours.push(
      byHour.get(h) ?? {
        hourLabel: String(h).padStart(2, "0"),
        chancePercent: 0,
        amountMm: null,
      },
    );
  }
  return nextHours;
}

/** Sum hourly mm over the 07–22 strip; null if no hour reported an amount. */
export function sumDaytimeAmountMm(hours: PrecipHour[]): number | null {
  let sum = 0;
  let any = false;
  for (const h of hours) {
    if (h.amountMm == null) continue;
    any = true;
    sum += h.amountMm;
  }
  if (!any) return null;
  return Math.round(sum * 10) / 10;
}

/** Italian label for the daily precip summary, e.g. "Oggi 2,4 mm". */
export function formatOggiPrecipMm(mm: number): string {
  const rounded = Math.round(mm * 10) / 10;
  const body =
    Math.abs(rounded - Math.trunc(rounded)) < 1e-9
      ? String(Math.trunc(rounded))
      : rounded.toFixed(1).replace(".", ",");
  return `Oggi ${body} mm`;
}
