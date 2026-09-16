/**
 * Cheap reverse geocode for the weather kicker.
 * Uses BigDataCloud's key-free client endpoint (Italian labels when available).
 */
export async function reverseGeocodeCity(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: "it",
    });
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4_000),
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
    };
    const label =
      json.city?.trim() ||
      json.locality?.trim() ||
      json.principalSubdivision?.trim() ||
      null;
    return label;
  } catch {
    return null;
  }
}

export function formatApproxCoords(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
}
