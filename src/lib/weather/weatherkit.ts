import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "@/lib/config";
import {
  conditionFromWeatherKit,
  emptyPrecipitation,
  hourLabelInZone,
  labelForCondition,
} from "./mock";
import type {
  PrecipHour,
  PrecipitationForecast,
  WeatherProvider,
  WeatherSnapshot,
} from "./types";

const HOURLY_SLOTS = 6;

type WeatherKitCurrent = {
  asOf?: string;
  temperature?: number;
  temperatureApparent?: number;
  humidity?: number;
  windSpeed?: number;
  conditionCode?: string;
};

type WeatherKitDay = {
  temperatureMax?: number;
  temperatureMin?: number;
  precipitationChance?: number;
  precipitationAmount?: number;
  conditionCode?: string;
};

type WeatherKitHour = {
  forecastStart?: string;
  precipitationChance?: number;
  precipitationIntensity?: number;
  precipitationAmount?: number;
  conditionCode?: string;
};

type WeatherKitResponse = {
  currentWeather?: WeatherKitCurrent;
  forecastDaily?: { days?: WeatherKitDay[] };
  forecastHourly?: { hours?: WeatherKitHour[] };
};

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function resolvePrivateKeyPem(): string | null {
  const inline = config.weather.weatherKit.privateKey.trim();
  if (inline) {
    return inline.includes("\\n")
      ? inline.replace(/\\n/g, "\n")
      : inline;
  }
  const path = config.weather.weatherKit.privateKeyPath.trim();
  if (!path) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function weatherKitConfigured(): boolean {
  const { teamId, keyId, serviceId } = config.weather.weatherKit;
  return Boolean(
    teamId && keyId && serviceId && resolvePrivateKeyPem(),
  );
}

/**
 * WeatherKit REST JWT (ES256). Requires Apple Developer WeatherKit key.
 * @see https://developer.apple.com/documentation/weatherkitrestapi
 */
function createWeatherKitJwt(): string {
  const { teamId, keyId, serviceId } = config.weather.weatherKit;
  const pem = resolvePrivateKeyPem();
  if (!pem) {
    throw new Error("WeatherKit: chiave privata assente");
  }

  const header = {
    alg: "ES256",
    kid: keyId,
    id: `${teamId}.${serviceId}`,
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60,
    sub: serviceId,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const key = createPrivateKey(pem);
  const signature = sign("SHA256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${base64url(signature)}`;
}

function buildPrecipitation(
  json: WeatherKitResponse,
  timezone: string,
): PrecipitationForecast {
  const day = json.forecastDaily?.days?.[0];
  const todayChance =
    day?.precipitationChance != null
      ? Math.round(day.precipitationChance * 100)
      : null;
  const todayAmount =
    day?.precipitationAmount != null
      ? Math.round(day.precipitationAmount * 10) / 10
      : null;

  const hours = json.forecastHourly?.hours ?? [];
  const now = Date.now();
  const nextHours: PrecipHour[] = [];

  for (const hour of hours) {
    if (nextHours.length >= HOURLY_SLOTS) break;
    if (!hour.forecastStart) continue;
    const t = Date.parse(hour.forecastStart);
    if (Number.isNaN(t) || t < now - 30 * 60 * 1000) continue;
    nextHours.push({
      hourLabel: hourLabelInZone(hour.forecastStart, timezone),
      chancePercent:
        hour.precipitationChance != null
          ? Math.round(hour.precipitationChance * 100)
          : 0,
      amountMm:
        hour.precipitationAmount != null
          ? Math.round(hour.precipitationAmount * 10) / 10
          : hour.precipitationIntensity != null
            ? Math.round(hour.precipitationIntensity * 10) / 10
            : null,
    });
  }

  return {
    todayChancePercent: todayChance,
    todayAmountMm: todayAmount,
    nextHours,
  };
}

export const weatherKitProvider: WeatherProvider = {
  id: "weatherkit",
  labelIt: "Apple Weather",
  isConfigured: weatherKitConfigured,
  async fetch(): Promise<WeatherSnapshot> {
    if (!weatherKitConfigured()) {
      throw new Error(
        "WeatherKit non configurato (servono Team ID, Key ID, Service ID e chiave .p8)",
      );
    }

    const token = createWeatherKitJwt();
    const { latitude, longitude, city } = config.weather;
    const lang = "it";
    const params = new URLSearchParams({
      dataSets: "currentWeather,forecastDaily,forecastHourly",
      timezone: config.timezone,
    });
    const url = `https://weatherkit.apple.com/api/v1/weather/${lang}/${latitude}/${longitude}?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `WeatherKit HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
      );
    }

    const json = (await res.json()) as WeatherKitResponse;
    const current = json.currentWeather;
    if (!current || current.temperature == null) {
      throw new Error("WeatherKit: currentWeather assente");
    }

    const condition = conditionFromWeatherKit(current.conditionCode ?? "");
    const day = json.forecastDaily?.days?.[0];
    const precipitation = buildPrecipitation(json, config.timezone);

    return {
      city,
      timezone: config.timezone,
      observedAt: current.asOf ?? new Date().toISOString(),
      temperatureC: Math.round(current.temperature),
      feelsLikeC:
        current.temperatureApparent != null
          ? Math.round(current.temperatureApparent)
          : null,
      humidityPercent:
        current.humidity != null
          ? Math.round(current.humidity * 100)
          : null,
      // WeatherKit documents windSpeed in km/h when using metric locale.
      windKmh:
        current.windSpeed != null ? Math.round(current.windSpeed) : null,
      condition,
      conditionLabelIt: labelForCondition(condition),
      highC:
        day?.temperatureMax != null ? Math.round(day.temperatureMax) : null,
      lowC:
        day?.temperatureMin != null ? Math.round(day.temperatureMin) : null,
      precipitation:
        precipitation.nextHours.length > 0 ||
        precipitation.todayChancePercent != null
          ? precipitation
          : emptyPrecipitation(),
      source: "weatherkit",
      isMock: false,
    };
  },
};
