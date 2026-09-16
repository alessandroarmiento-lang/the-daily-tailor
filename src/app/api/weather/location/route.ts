import {
  defaultWeatherLocation,
  loadLastWeatherLocation,
} from "@/lib/weather";

export const dynamic = "force-dynamic";

/** Last GPS/saved weather location, or Milano default. */
export async function GET() {
  const stored = await loadLastWeatherLocation();
  const location = stored ?? defaultWeatherLocation();
  return Response.json({
    ok: true,
    location,
    hasStored: Boolean(stored),
  });
}
