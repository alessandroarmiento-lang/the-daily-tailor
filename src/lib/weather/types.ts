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
   * or provider equivalent). UI label: “Oggi previsti X mm”.
   */
  todayAmountMm: number | null;
  /** Fixed 07–22 strip — percent chance under each hour. */
  nextHours: PrecipHour[];
};

export type WeatherSnapshot = {
  city: string;
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

export interface WeatherProvider {
  readonly id: WeatherSource;
  /** Human label for footer notes (Italian). */
  readonly labelIt: string;
  isConfigured(): boolean;
  fetch(): Promise<WeatherSnapshot>;
}
