import type { WeatherLocationSource } from "./location-types";

export type WeatherCondition =
  | "clear"
  | "partly_cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunderstorm"
  | "unknown";

export type WeatherSource =
  | "weatherkit"
  | "open-meteo"
  | "openweathermap"
  | "mock";

/** Compact hourly precip slot for the leftover space under meteo. */
export type PrecipHour = {
  /** Local hour label, e.g. "09" or "14". */
  hourLabel: string;
  /** 0–100 chance of precipitation. */
  chancePercent: number;
  /** Optional intensity hint in mm (may be 0). */
  amountMm: number | null;
};

export type PrecipitationForecast = {
  /** Peak / representative chance for the calendar day (0–100). Kept for adapters; UI uses mm for “Oggi”. */
  todayChancePercent: number | null;
  /**
   * Expected liquid total for today in mm (Open-Meteo `precipitation_sum`
   * or provider equivalent). UI label: “oggi previsti X mm”.
   */
  todayAmountMm: number | null;
  /** Fixed 07–22 strip — percent chance under each hour. */
  nextHours: PrecipHour[];
};

/** Fix a snapshot was built from — lets the sheet/API show whose position it is. */
export type WeatherPlace = {
  latitude: number;
  longitude: number;
  source: WeatherLocationSource;
  /** ISO timestamp of the fix (GPS read or last save). */
  updatedAt: string;
};

export type WeatherSnapshot = {
  city: string;
  /** Absent on editions cached before the field existed. */
  place?: WeatherPlace;
  timezone: string;
  observedAt: string;
  temperatureC: number;
  feelsLikeC: number | null;
  humidityPercent: number | null;
  windKmh: number | null;
  condition: WeatherCondition;
  conditionLabelIt: string;
  highC: number | null;
  lowC: number | null;
  precipitation: PrecipitationForecast;
  source: WeatherSource;
  isMock: boolean;
};

export type SectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; data?: T };

export type WeatherFetchLocation = {
  latitude: number;
  longitude: number;
  city: string;
};

export interface WeatherProvider {
  readonly id: WeatherSource;
  /** Human label for footer notes (Italian). */
  readonly labelIt: string;
  isConfigured(): boolean;
  fetch(location?: WeatherFetchLocation): Promise<WeatherSnapshot>;
}
