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
  source: "open-meteo" | "openweathermap" | "mock";
  isMock: boolean;
};

export type SectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; data?: T };
