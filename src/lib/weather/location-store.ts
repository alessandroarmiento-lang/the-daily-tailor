import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import type { WeatherLocation } from "./location-types";

function locationRoot(): string {
  const override = process.env.EDITIONS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data", "editions");
}

function locationPath(): string {
  return path.join(locationRoot(), "last-weather-location.json");
}

function isFiniteCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseStored(raw: unknown): WeatherLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isFiniteCoord(o.latitude) || !isFiniteCoord(o.longitude)) return null;
  if (Math.abs(o.latitude) > 90 || Math.abs(o.longitude) > 180) return null;
  const city =
    typeof o.city === "string" && o.city.trim() ? o.city.trim() : null;
  if (!city) return null;
  const source =
    o.source === "gps" || o.source === "last_known" || o.source === "default"
      ? o.source
      : "last_known";
  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt
      ? o.updatedAt
      : new Date().toISOString();
  return {
    latitude: o.latitude,
    longitude: o.longitude,
    city,
    source,
    updatedAt,
  };
}

export function defaultWeatherLocation(): WeatherLocation {
  return {
    latitude: config.weather.latitude,
    longitude: config.weather.longitude,
    city: config.weather.city,
    source: "default",
    updatedAt: new Date(0).toISOString(),
  };
}

/** Last GPS/saved fix from the PWA, or null if never stored. */
export async function loadLastWeatherLocation(): Promise<WeatherLocation | null> {
  try {
    const raw = await readFile(locationPath(), "utf8");
    return parseStored(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveLastWeatherLocation(
  location: WeatherLocation,
): Promise<void> {
  const root = locationRoot();
  await mkdir(root, { recursive: true });
  const payload: WeatherLocation = {
    latitude: location.latitude,
    longitude: location.longitude,
    city: location.city.trim(),
    source: location.source === "default" ? "last_known" : location.source,
    updatedAt: location.updatedAt || new Date().toISOString(),
  };
  await writeFile(
    locationPath(),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Prefer explicit coords, else last saved fix, else env/Milano default.
 * Morning warm uses the last stored iPhone location when present.
 */
export async function resolveWeatherLocation(options?: {
  latitude?: number;
  longitude?: number;
  city?: string;
  source?: WeatherLocation["source"];
}): Promise<WeatherLocation> {
  if (
    options &&
    isFiniteCoord(options.latitude) &&
    isFiniteCoord(options.longitude) &&
    Math.abs(options.latitude) <= 90 &&
    Math.abs(options.longitude) <= 180
  ) {
    return {
      latitude: options.latitude,
      longitude: options.longitude,
      city: options.city?.trim() || "",
      source: options.source ?? "gps",
      updatedAt: new Date().toISOString(),
    };
  }

  const stored = await loadLastWeatherLocation();
  if (stored) {
    return { ...stored, source: "last_known" };
  }
  return defaultWeatherLocation();
}
