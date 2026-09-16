"use client";

import {
  type GeoPermissionOutcome,
  readLocalWeatherLocation,
  requestBrowserGeolocation,
  saveLocalWeatherLocation,
} from "@/lib/client-weather-location";
import type { WeatherLocation } from "@/lib/weather/location-types";
import type { SectionResult, WeatherSnapshot } from "@/lib/weather/types";

export type WeatherGeoStatus =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "ok"; location: WeatherLocation; note: string }
  | { kind: "fallback"; location: WeatherLocation; note: string };

/** `?lat=&lon=` on the page: check a position from any browser, phone aside. */
export type WeatherGeoOverride = {
  latitude: number;
  longitude: number;
};

type WeatherApiResponse = {
  ok: boolean;
  location?: WeatherLocation;
  weather?: SectionResult<WeatherSnapshot>;
  error?: string;
};

export const MILANO_FALLBACK: WeatherLocation = {
  latitude: 45.4642,
  longitude: 9.19,
  city: "Milano",
  source: "default",
  updatedAt: new Date(0).toISOString(),
};

/** Short enough for the printed meteo footer, next to the place kicker. */
function failureLabel(geo: GeoPermissionOutcome): string | null {
  if (geo.ok) return null;
  switch (geo.reason) {
    case "denied":
      return "Posizione negata";
    case "timeout":
      return "Timeout posizione";
    case "unsupported":
      return "GPS non supportato";
    default:
      return "Posizione non disponibile";
  }
}

function fallbackNote(
  location: WeatherLocation,
  failure: string | null,
): string {
  const isDefault = location.source === "default";
  if (failure) {
    return `${failure} — ${isDefault ? "Milano (predefinita)" : "ultima posizione nota"}`;
  }
  return isDefault ? "Milano (predefinita)" : "Ultima posizione nota";
}

async function fetchWeatherForCoords(options: {
  latitude?: number;
  longitude?: number;
  city?: string;
  save?: boolean;
}): Promise<WeatherApiResponse | null> {
  const params = new URLSearchParams();
  if (
    options.latitude != null &&
    options.longitude != null &&
    Number.isFinite(options.latitude) &&
    Number.isFinite(options.longitude)
  ) {
    params.set("lat", String(options.latitude));
    params.set("lon", String(options.longitude));
    if (options.save) params.set("save", "1");
  }
  if (options.city) params.set("city", options.city);

  const qs = params.toString();
  const res = await fetch(`/api/weather${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) return null;
  return (await res.json()) as WeatherApiResponse;
}

export type WeatherGeoOutcome = {
  weather: SectionResult<WeatherSnapshot> | null;
  status: WeatherGeoStatus;
};

/**
 * Resolve “Meteo di oggi” for where the reader is right now: GPS → last known
 * → Milano. The caller swaps the result into the edition on screen; a real fix
 * is persisted server-side so the 06:00 warm starts from the same place.
 */
export async function refreshWeatherFromGeolocation(options?: {
  override?: WeatherGeoOverride | null;
  onStatus?: (status: WeatherGeoStatus) => void;
}): Promise<WeatherGeoOutcome> {
  const report = (status: WeatherGeoStatus) => options?.onStatus?.(status);

  if (options?.override) {
    report({ kind: "locating" });
    // Not persisted: a test position must not become the warm's location.
    const body = await fetchWeatherForCoords({
      latitude: options.override.latitude,
      longitude: options.override.longitude,
    });
    if (body?.ok && body.weather?.data && body.location) {
      const status: WeatherGeoStatus = {
        kind: "ok",
        location: body.location,
        note: "Posizione di prova",
      };
      report(status);
      return { weather: body.weather, status };
    }
  }

  report({ kind: "locating" });
  const geo = await requestBrowserGeolocation();

  if (geo.ok) {
    const body = await fetchWeatherForCoords({
      latitude: geo.latitude,
      longitude: geo.longitude,
      save: true,
    });
    if (body?.ok && body.weather?.data && body.location) {
      await saveLocalWeatherLocation(body.location);
      const status: WeatherGeoStatus = {
        kind: "ok",
        location: body.location,
        note: "Posizione GPS",
      };
      report(status);
      return { weather: body.weather, status };
    }
  }

  const failure = failureLabel(geo);
  const local = await readLocalWeatherLocation();
  if (local) {
    // City left out on purpose: the server re-derives the comune from coords.
    const body = await fetchWeatherForCoords({
      latitude: local.latitude,
      longitude: local.longitude,
      save: true,
    });
    if (body?.ok && body.weather?.data && body.location) {
      await saveLocalWeatherLocation({
        ...body.location,
        source: "last_known",
      });
      const status: WeatherGeoStatus = {
        kind: "fallback",
        location: body.location,
        note: fallbackNote(
          { ...body.location, source: "last_known" },
          failure,
        ),
      };
      report(status);
      return { weather: body.weather, status };
    }
  }

  const body = await fetchWeatherForCoords({});
  if (body?.ok && body.weather?.data && body.location) {
    if (body.location.source !== "default") {
      await saveLocalWeatherLocation(body.location);
    }
    const status: WeatherGeoStatus = {
      kind: "fallback",
      location: body.location,
      note: fallbackNote(body.location, failure),
    };
    report(status);
    return { weather: body.weather, status };
  }

  const status: WeatherGeoStatus = {
    kind: "fallback",
    location: MILANO_FALLBACK,
    note: failure
      ? `${failure} — meteo dell’edizione`
      : "Meteo posizione non aggiornato — resta l’edizione caricata.",
  };
  report(status);
  return { weather: null, status };
}

/** `?lat=&lon=` from the current URL, ignored unless both are real coords. */
export function readWeatherGeoOverride(
  search: string,
): WeatherGeoOverride | null {
  const params = new URLSearchParams(search);
  const rawLat = params.get("lat");
  const rawLon = params.get("lon");
  if (!rawLat?.trim() || !rawLon?.trim()) return null;
  const latitude = Number(rawLat);
  const longitude = Number(rawLon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
