/**
 * Cheap reverse geocode for the weather kicker.
 * Uses BigDataCloud's key-free client endpoint (Italian labels when available).
 */

type AdministrativeArea = {
  name?: string;
  adminLevel?: number;
};

type ReverseGeocodeResponse = {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  localityInfo?: {
    administrative?: AdministrativeArea[];
  };
};

/** OSM admin level of an Italian comune — the name a reader expects. */
const COMUNE_ADMIN_LEVEL = 8;
/** Same fix is resolved on every weather call; 3 decimals ≈ 100 m. */
const CACHE_TTL_MS = 6 * 60 * 60_000;

const labelCache = new Map<string, { label: string; at: number }>();

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

/**
 * In Italy `city` is the province / città metropolitana: Legnano answers
 * "Milano", Cinisello answers "Milano". The comune entry is the real place,
 * and capitals (Milano, Roma) have no adminLevel 8 so they fall back to it.
 */
function pickPlaceLabel(json: ReverseGeocodeResponse): string | null {
  const comune = json.localityInfo?.administrative?.find(
    (area) => area.adminLevel === COMUNE_ADMIN_LEVEL && area.name?.trim(),
  );
  return (
    comune?.name?.trim() ||
    json.city?.trim() ||
    json.locality?.trim() ||
    json.principalSubdivision?.trim() ||
    null
  );
}

export async function reverseGeocodeCity(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const key = cacheKey(latitude, longitude);
  const cached = labelCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.label;

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
    const label = pickPlaceLabel((await res.json()) as ReverseGeocodeResponse);
    if (label) labelCache.set(key, { label, at: Date.now() });
    return label;
  } catch {
    return null;
  }
}

export function formatApproxCoords(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
}
