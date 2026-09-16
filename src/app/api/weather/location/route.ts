import {
  loadLastWeatherLocation,
  prepareWeatherLocation,
} from "@/lib/weather";

export const dynamic = "force-dynamic";

/** Last GPS/saved weather location, or Milano default. */
export async function GET() {
  const stored = await loadLastWeatherLocation();
  // Same resolution the sheet uses, so the label here matches the kicker.
  const location = await prepareWeatherLocation();
  return Response.json({
    ok: true,
    location,
    hasStored: Boolean(stored),
    storedLabel: stored?.city ?? null,
  });
}
