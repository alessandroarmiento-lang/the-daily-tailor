import { config } from "@/lib/config";
import { formatApproxCoords, reverseGeocodeCity } from "./geocode";
import {
  defaultWeatherLocation,
  resolveWeatherLocation,
  saveLastWeatherLocation,
} from "./location-store";
import type { WeatherLocation, WeatherLocationInput } from "./location-types";
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
      async fetch(location) {
        return mockWeather(
          location?.city ?? config.weather.city,
          config.timezone,
        );
      },
    };
  }

  if (weatherKitProvider.isConfigured()) return weatherKitProvider;
  return openMeteoProvider;
}

async function ensureCityLabel(
  latitude: number,
  longitude: number,
  city?: string,
): Promise<string> {
  const trimmed = city?.trim();
  if (trimmed) return trimmed;
  const geocoded = await reverseGeocodeCity(latitude, longitude);
  return geocoded ?? formatApproxCoords(latitude, longitude);
}

/**
 * Resolve coords (explicit → last stored → Milano default), optionally persist,
 * and attach a display city label.
 */
export async function prepareWeatherLocation(
  input?: WeatherLocationInput,
  options?: { persist?: boolean },
): Promise<WeatherLocation> {
  const resolved = await resolveWeatherLocation(input);
  const city = await ensureCityLabel(
    resolved.latitude,
    resolved.longitude,
    input?.city ?? resolved.city,
  );
  const location: WeatherLocation = {
    ...resolved,
    city,
    updatedAt: input ? new Date().toISOString() : resolved.updatedAt,
  };

  if (options?.persist && location.source !== "default") {
    await saveLastWeatherLocation(location);
  }

  return location;
}

export async function fetchWeatherSnapshot(
  location: WeatherLocation,
): Promise<SectionResult<WeatherSnapshot>> {
  const provider = resolveWeatherProvider();
  const fetchLoc = {
    latitude: location.latitude,
    longitude: location.longitude,
    city: location.city,
  };

  try {
    if (!provider.isConfigured()) {
      throw new Error(`${provider.labelIt}: non configurato`);
    }
    const data = await provider.fetch(fetchLoc);
    return { status: "ok", data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Meteo non disponibile";

    if (provider.id === "weatherkit") {
      try {
        const data = await openMeteoProvider.fetch(fetchLoc);
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
      data: mockWeather(
        location.city || defaultWeatherLocation().city,
        config.timezone,
      ),
    };
  }
}

/**
 * Fetch via the active WeatherProvider. On failure, return mock + precip
 * so print still works.
 *
 * Without override: last GPS saved on the server (for morning warm), else Milano.
 */
export async function getWeather(
  locationInput?: WeatherLocationInput,
  options?: { persistLocation?: boolean },
): Promise<SectionResult<WeatherSnapshot>> {
  const location = await prepareWeatherLocation(locationInput, {
    persist: options?.persistLocation === true,
  });
  return fetchWeatherSnapshot(location);
}

export type { WeatherSnapshot, PrecipitationForecast, PrecipHour } from "./types";
export type {
  WeatherLocation,
  WeatherLocationInput,
  WeatherLocationSource,
} from "./location-types";
export { weatherKitProvider } from "./weatherkit";
export { openMeteoProvider } from "./open-meteo";
export {
  defaultWeatherLocation,
  loadLastWeatherLocation,
  resolveWeatherLocation,
  saveLastWeatherLocation,
} from "./location-store";
