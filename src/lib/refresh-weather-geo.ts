"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  readLocalWeatherLocation,
  requestBrowserGeolocation,
  saveLocalWeatherLocation,
} from "@/lib/client-weather-location";
import type { NewspaperEdition } from "@/lib/edition-types";
import type { WeatherLocation } from "@/lib/weather/location-types";
import type { SectionResult, WeatherSnapshot } from "@/lib/weather/types";

export type WeatherGeoStatus =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "ok"; location: WeatherLocation; note: string }
  | { kind: "fallback"; location: WeatherLocation; note: string };

type WeatherApiResponse = {
  ok: boolean;
  location?: WeatherLocation;
  weather?: SectionResult<WeatherSnapshot>;
  error?: string;
};

function sourceNote(location: WeatherLocation, denied?: boolean): string {
  if (location.source === "gps") return "Posizione GPS";
  if (location.source === "last_known") {
    return denied
      ? "Posizione negata — ultima nota"
      : "Ultima posizione nota";
  }
  return denied
    ? "Posizione negata — Milano (predefinita)"
    : "Milano (predefinita)";
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

function patchEditionWeather(
  edition: NewspaperEdition,
  weather: SectionResult<WeatherSnapshot>,
): NewspaperEdition {
  return { ...edition, weather };
}

/**
 * Request GPS (or last known / Milano), refresh “Meteo di oggi”, persist
 * last fix for morning warm on Fly.
 */
export async function refreshWeatherFromGeolocation(
  setEdition: Dispatch<SetStateAction<NewspaperEdition | null>>,
  setGeoStatus: (status: WeatherGeoStatus) => void,
): Promise<void> {
  setGeoStatus({ kind: "locating" });

  const geo = await requestBrowserGeolocation();

  if (geo.ok) {
    const body = await fetchWeatherForCoords({
      latitude: geo.latitude,
      longitude: geo.longitude,
      save: true,
    });
    if (body?.ok && body.weather?.data && body.location) {
      await saveLocalWeatherLocation(body.location);
      setEdition((prev) =>
        prev ? patchEditionWeather(prev, body.weather!) : prev,
      );
      setGeoStatus({
        kind: "ok",
        location: body.location,
        note: sourceNote(body.location),
      });
      return;
    }
  }

  const denied = !geo.ok && geo.reason === "denied";
  const local = await readLocalWeatherLocation();
  if (local) {
    const body = await fetchWeatherForCoords({
      latitude: local.latitude,
      longitude: local.longitude,
      city: local.city,
      save: true,
    });
    if (body?.ok && body.weather?.data && body.location) {
      setEdition((prev) =>
        prev ? patchEditionWeather(prev, body.weather!) : prev,
      );
      setGeoStatus({
        kind: "fallback",
        location: body.location,
        note:
          (!geo.ok ? `${geo.message} ` : "") +
          sourceNote({ ...body.location, source: "last_known" }, denied),
      });
      return;
    }
  }

  const body = await fetchWeatherForCoords({});
  if (body?.ok && body.weather?.data && body.location) {
    if (body.location.source !== "default") {
      await saveLocalWeatherLocation(body.location);
    }
    setEdition((prev) =>
      prev ? patchEditionWeather(prev, body.weather!) : prev,
    );
    setGeoStatus({
      kind: "fallback",
      location: body.location,
      note:
        (!geo.ok ? `${geo.message} ` : "") +
        sourceNote(body.location, denied),
    });
    return;
  }

  setGeoStatus({
    kind: "fallback",
    location: {
      latitude: 45.4642,
      longitude: 9.19,
      city: "Milano",
      source: "default",
      updatedAt: new Date(0).toISOString(),
    },
    note: !geo.ok
      ? geo.message
      : "Meteo posizione non aggiornato — resta l’edizione caricata.",
  });
}
