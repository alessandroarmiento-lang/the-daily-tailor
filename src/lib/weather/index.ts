import { config } from "@/lib/config";
import { mockWeather } from "./mock";
import { openMeteoProvider } from "./open-meteo";
import type { SectionResult, WeatherProvider, WeatherSnapshot } from "./types";
import { weatherKitProvider } from "./weatherkit";

/**
 * Prefer Apple WeatherKit when credentials are present.
 * Otherwise use Open-Meteo (includes precip) so the sheet never blocks on keys.
 */
export function resolveWeatherProvider(): WeatherProvider {
  const forced = config.weather.provider;
  if (forced === "weatherkit") return weatherKitProvider;
  if (forced === "open-meteo") return openMeteoProvider;
  if (forced === "mock") {
    return {
      id: "mock",
      labelIt: "Mock",
      isConfigured: () => true,
      async fetch() {
        return mockWeather(config.weather.city, config.timezone);
      },
    };
  }

  if (weatherKitProvider.isConfigured()) return weatherKitProvider;
  return openMeteoProvider;
}

/**
 * Fetch via the active WeatherProvider. On failure, return mock + precip
 * so print still works.
 */
export async function getWeather(): Promise<SectionResult<WeatherSnapshot>> {
  const provider = resolveWeatherProvider();
  try {
    if (!provider.isConfigured()) {
      throw new Error(`${provider.labelIt}: non configurato`);
    }
    const data = await provider.fetch();
    return { status: "ok", data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Meteo non disponibile";

    // If WeatherKit was selected but failed, try Open-Meteo before mock.
    if (provider.id === "weatherkit") {
      try {
        const data = await openMeteoProvider.fetch();
        return {
          status: "error",
          message: `Apple Weather non disponibile (${message}). Uso Open-Meteo.`,
          data,
        };
      } catch {
        // fall through to mock
      }
    }

    return {
      status: "error",
      message,
      data: mockWeather(config.weather.city, config.timezone),
    };
  }
}

export type { WeatherSnapshot, PrecipitationForecast, PrecipHour } from "./types";
export { weatherKitProvider } from "./weatherkit";
export { openMeteoProvider } from "./open-meteo";
