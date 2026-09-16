import {
  defaultWeatherLocation,
  fetchWeatherSnapshot,
  prepareWeatherLocation,
} from "@/lib/weather";

export const dynamic = "force-dynamic";

function parseCoord(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Live weather for the sheet.
 * Query: ?lat=&lon=&city= (optional). Without coords → last stored → Milano.
 * ?save=1 persists lat/lon as last known (for morning warm).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = parseCoord(url.searchParams.get("lat"));
  const lon = parseCoord(url.searchParams.get("lon"));
  const cityParam = url.searchParams.get("city")?.trim() || undefined;
  const save = url.searchParams.get("save") === "1";

  const hasCoords = lat != null && lon != null;
  if ((lat == null) !== (lon == null)) {
    return Response.json(
      { ok: false, error: "Serve sia lat che lon" },
      { status: 400 },
    );
  }
  if (lat != null && (Math.abs(lat) > 90 || Math.abs(lon!) > 180)) {
    return Response.json(
      { ok: false, error: "Coordinate fuori range" },
      { status: 400 },
    );
  }

  const location = await prepareWeatherLocation(
    hasCoords
      ? {
          latitude: lat!,
          longitude: lon!,
          city: cityParam,
          source: "gps",
        }
      : undefined,
    { persist: save && hasCoords },
  );

  const weather = await fetchWeatherSnapshot(location);

  return Response.json({
    ok: true,
    location,
    weather,
    fallback: defaultWeatherLocation(),
  });
}

/** Persist last known location from the PWA (no weather fetch). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON non valido" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const latitude = typeof o.latitude === "number" ? o.latitude : Number(o.latitude);
  const longitude =
    typeof o.longitude === "number" ? o.longitude : Number(o.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json(
      { ok: false, error: "latitude/longitude richiesti" },
      { status: 400 },
    );
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return Response.json(
      { ok: false, error: "Coordinate fuori range" },
      { status: 400 },
    );
  }

  const city =
    typeof o.city === "string" && o.city.trim() ? o.city.trim() : undefined;
  const location = await prepareWeatherLocation(
    { latitude, longitude, city, source: "gps" },
    { persist: true },
  );

  return Response.json({ ok: true, location });
}
